import {
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Notification } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NOTIFICATION_EVENTS } from './notification-events';
import { NotificationGateway } from './notification.gateway';

export type CreateNotificationPayload = CreateNotificationDto;

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => NotificationGateway))
    private readonly gateway: NotificationGateway,
  ) {}

  async create(dto: CreateNotificationDto): Promise<Notification> {
    return this.prisma.notification.create({ data: dto });
  }

  async findAllForUser(userId: string, limit = 20): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  @OnEvent(NOTIFICATION_EVENTS.CREATE)
  async handleCreateEvent(payload: CreateNotificationPayload): Promise<void> {
    const notification = await this.create(payload);
    this.gateway.sendToUser(payload.userId, notification);
  }
}
