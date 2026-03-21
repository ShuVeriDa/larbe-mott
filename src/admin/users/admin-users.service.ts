import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, RoleName, UserStatus } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { AdminUserDetailsDto } from "./dto/admin-user-details.dto";
import { AdminUserListItemDto } from "./dto/admin-user-list-item.dto";
import { AdminUserStatusDto } from "./dto/admin-user-status.dto";
import { AdminUsersListResponseDto } from "./dto/admin-users-list-response.dto";
import { FetchAdminUsersDto } from "./dto/fetch-admin-users.dto";
import { FetchUserEventsDto } from "./dto/fetch-user-events.dto";
import { FetchUserEventsSummaryDto } from "./dto/fetch-user-events-summary.dto";
import { UserAnalyticsService } from "./user-analytics.service";

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userAnalytics: UserAnalyticsService,
  ) {}

  async getUsers(
    query: FetchAdminUsersDto,
  ): Promise<AdminUsersListResponseDto> {
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
      where.roles = {
        some: {
          role: {
            name: { equals: query.role },
          },
        },
      };
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
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("User not found");

    await this.prisma.user.update({
      where: { id },
      data: { status: dto.status, lastActiveAt: new Date(), updatedAt: new Date() },
    });
    return this.getUserById(id);
  }

  async deleteUser(
    id: string,
    dto: AdminUserStatusDto,
  ): Promise<AdminUserListItemDto> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("User not found");

    await this.prisma.user.update({
      where: { id },
      data: { status: dto.status, deletedAt: new Date(), updatedAt: new Date() },
    });
    return this.getUserById(id);
  }

  async logoutAllSessions(id: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("User not found");

    await this.prisma.user.update({
      where: { id },
      data: { hashedRefreshToken: null },
    });
  }

  async getUserEvents(userId: string, query: FetchUserEventsDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(200, Math.max(1, query.limit ?? 50));
    const skip = (page - 1) * limit;

    const where: Prisma.UserEventWhereInput = {
      userId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.userEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.userEvent.count({ where }),
    ]);

    return { items, total, page, limit, skip };
  }

  async getUserEventsSummary(userId: string, query: FetchUserEventsSummaryDto) {
    const where: Prisma.UserEventWhereInput = {
      userId,
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const events = await this.prisma.userEvent.findMany({
      where,
      select: { type: true, metadata: true },
    });

    const counts: Record<string, number> = {};
    const failByNormalized = new Map<string, number>();
    const clicksByNormalized = new Map<string, number>();

    for (const e of events) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;

      const md = e.metadata as any;
      const normalized = md?.normalized;

      if (e.type === "FAIL_LOOKUP" && typeof normalized === "string") {
        failByNormalized.set(
          normalized,
          (failByNormalized.get(normalized) ?? 0) + 1,
        );
      }

      if (e.type === "CLICK_WORD" && typeof normalized === "string") {
        clicksByNormalized.set(
          normalized,
          (clicksByNormalized.get(normalized) ?? 0) + 1,
        );
      }
    }

    const topFailLookups = Array.from(failByNormalized.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([normalized, count]) => ({ normalized, count }));

    const topClicks = Array.from(clicksByNormalized.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([normalized, count]) => ({ normalized, count }));

    return {
      counts,
      // Handy aliases for dashboard strings:
      clickWordCount: counts["CLICK_WORD"] ?? 0,
      dictionaryLookupFailedCount: counts["FAIL_LOOKUP"] ?? 0,
      topFailLookups,
      topClicks,
    };
  }

  async getUserRoles(userId: string) {
    const roles = await this.prisma.userRoleAssignment.findMany({
      where: { userId },
      select: {
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    return roles.map((r) => r.role);
  }

  async assignRole(userId: string, role: RoleName, assignedBy?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    const roleRow = await this.prisma.role.findUnique({
      where: { name: role },
      select: { id: true },
    });
    if (!roleRow) throw new NotFoundException("Role not found");

    const existing = await this.prisma.userRoleAssignment.findUnique({
      where: { userId_roleId: { userId, roleId: roleRow.id } },
    });
    if (existing) throw new ConflictException("User already has this role");

    await this.prisma.userRoleAssignment.create({
      data: { userId, roleId: roleRow.id, assignedBy: assignedBy ?? null },
    });

    return this.getUserRoles(userId);
  }

  async revokeRole(userId: string, roleId: string) {
    const existing = await this.prisma.userRoleAssignment.findUnique({
      where: { userId_roleId: { userId, roleId } },
    });
    if (!existing) throw new NotFoundException("Role assignment not found");

    await this.prisma.userRoleAssignment.delete({
      where: { userId_roleId: { userId, roleId } },
    });
    return this.getUserRoles(userId);
  }
}
