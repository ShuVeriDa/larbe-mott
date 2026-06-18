import {
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Notification, NotificationType } from '@prisma/client';
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
    return this.prisma.notification.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        entityId: dto.entityId,
        title: dto.title,
        body: dto.body,
      },
    });
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

    if (await this.isInAppBlocked(payload.userId, payload.type)) return;

    this.gateway.sendToUser(payload.userId, notification);
  }

  private async isInAppBlocked(userId: string, type: NotificationType): Promise<boolean> {
    const prefs = await this.prisma.userNotificationPreferences.findUnique({
      where: { userId },
      select: {
        inAppFeedbackReply: true,
        inAppSuggestion: true,
        inAppTextSubmission: true,
        inAppNewTexts: true,
      },
    });
    if (!prefs) return false;

    if (type === NotificationType.FEEDBACK_REPLY) return !prefs.inAppFeedbackReply;
    if (
      type === NotificationType.SUGGESTION_APPROVED ||
      type === NotificationType.SUGGESTION_REJECTED
    ) return !prefs.inAppSuggestion;
    if (
      type === NotificationType.TEXT_SUBMISSION_APPROVED ||
      type === NotificationType.TEXT_SUBMISSION_REJECTED
    ) return !prefs.inAppTextSubmission;
    if (type === NotificationType.NEW_LIBRARY_TEXT) return !(prefs.inAppNewTexts ?? true);
    if (type === NotificationType.PLATFORM_ANNOUNCEMENT) return false;

    return false;
  }
}
