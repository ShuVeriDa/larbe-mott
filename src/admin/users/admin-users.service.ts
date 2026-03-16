import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserStatus } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { AdminUserDetailsDto } from "./dto/admin-user-details.dto";
import { AdminUserListItemDto } from "./dto/admin-user-list-item.dto";
import { AdminUserStatusDto } from "./dto/admin-user-status.dto";
import { AdminUsersListResponseDto } from "./dto/admin-users-list-response.dto";
import { FetchUsersDto } from "./dto/fetch-users.dto";
import { UserAnalyticsService } from "./user-analytics.service";

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userAnalytics: UserAnalyticsService,
  ) {}

  async getUsers(query: FetchUsersDto): Promise<AdminUsersListResponseDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      status: { not: UserStatus.DELETED },
    };
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { email: { contains: q, mode: "insensitive" } },
        { username: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { surname: { contains: q, mode: "insensitive" } },
      ];
    }
    if (query.email?.trim()) {
      where.email = { equals: query.email.trim() };
    }
    if (query.username?.trim()) {
      where.username = { equals: query.username.trim() };
    }
    if (query.id?.trim()) {
      where.id = { equals: query.id.trim() };
    }
    if (query.language) {
      where.language = { equals: query.language };
    }
    if (query.level) {
      where.level = { equals: query.level };
    }
    if (query.status) {
      where.status = { equals: query.status };
    }
    if (query.role) {
      where.role = { equals: query.role };
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" }, // или lastActiveAt, как тебе нужно
        select: {
          id: true,
          email: true,
          username: true,
          name: true,
          surname: true,
          role: true,
          status: true,
          language: true,
          level: true,
          lastActiveAt: true,
          createdAt: true,
          updatedAt: true,
          signupAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users,
      total,
      page,
      limit,
      skip,
    };
  }

  async getUserById(id: string): Promise<AdminUserDetailsDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        surname: true,
        role: true,
        status: true,
        language: true,
        level: true,
        lastActiveAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const learningStats = await this.userAnalytics.getUserLearningStats(id);

    return {
      ...user,
      learningStats,
    };
  }

  async updateUserStatus(
    id: string,
    dto: AdminUserStatusDto,
  ): Promise<AdminUserListItemDto> {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        status: dto.status,
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return this.getUserById(user.id);
  }

  async deleteUser(
    id: string,
    dto: AdminUserStatusDto,
  ): Promise<AdminUserListItemDto> {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        status: dto.status,
        deletedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return this.getUserById(user.id);
  }

  async logoutAllSessions(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: {
        hashedRefreshToken: null,
      },
    });
  }
}
