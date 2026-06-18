import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { AnnouncementResponseDto } from './dto/announcement-response.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { ListAnnouncementsQueryDto } from './dto/list-announcements-query.dto';

const BROADCAST_CHUNK_SIZE = 100;
const MAX_BROADCAST_USERS = 10_000;

@Injectable()
export class AnnouncementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationGateway,
  ) {}

  async create(dto: CreateAnnouncementDto, adminId: string): Promise<AnnouncementResponseDto> {
    if (dto.textId) {
      const text = await this.prisma.text.findUnique({ where: { id: dto.textId }, select: { id: true } });
      if (!text) {
        throw new BadRequestException(`Text with id "${dto.textId}" not found`);
      }
    }

    const announcement = await this.prisma.announcement.create({
      data: { title: dto.title, body: dto.body, textId: dto.textId, createdById: adminId },
      include: { text: { select: { title: true } } },
    });

    await this.broadcastToAllUsers(announcement);

    return this.toResponseDto(announcement);
  }

  async findAll(query: ListAnnouncementsQueryDto): Promise<AnnouncementResponseDto[]> {
    const limit = query.limit ?? 50;

    const announcements = await this.prisma.announcement.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
      include: { text: { select: { title: true } } },
    });

    return announcements.map((a) => this.toResponseDto(a));
  }

  async softDelete(id: string): Promise<{ deleted: boolean; id: string }> {
    const announcement = await this.prisma.announcement.findUnique({ where: { id } });
    if (!announcement) {
      throw new NotFoundException(`Announcement "${id}" not found`);
    }

    await this.prisma.announcement.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { deleted: true, id };
  }

  async findById(id: string): Promise<AnnouncementResponseDto> {
    const announcement = await this.prisma.announcement.findUnique({
      where: { id },
      include: { text: { select: { title: true } } },
    });
    if (!announcement) {
      throw new NotFoundException(`Announcement "${id}" not found`);
    }
    return this.toResponseDto(announcement);
  }

  private async broadcastToAllUsers(
    announcement: { id: string; title: string; body: string | null; textId: string | null },
  ): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
      take: MAX_BROADCAST_USERS,
    });

    const userIds = users.map((u) => u.id);
    const now = new Date();

    await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type: NotificationType.PLATFORM_ANNOUNCEMENT,
        entityId: announcement.textId ?? null,
        title: announcement.title,
        body: announcement.body,
      })),
    });

    for (let i = 0; i < userIds.length; i += BROADCAST_CHUNK_SIZE) {
      const chunk = userIds.slice(i, i + BROADCAST_CHUNK_SIZE);
      for (const userId of chunk) {
        this.gateway.sendToUser(userId, {
          id: '',
          userId,
          type: NotificationType.PLATFORM_ANNOUNCEMENT,
          entityId: announcement.textId ?? null,
          title: announcement.title,
          body: announcement.body,
          isRead: false,
          createdAt: now,
        });
      }
    }
  }

  private toResponseDto(
    announcement: {
      id: string;
      title: string;
      body: string | null;
      textId: string | null;
      createdById: string;
      createdAt: Date;
      text?: { title: string } | null;
    },
  ): AnnouncementResponseDto {
    return {
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      textId: announcement.textId,
      textTitle: announcement.text?.title ?? null,
      createdById: announcement.createdById,
      createdAt: announcement.createdAt,
    };
  }
}
