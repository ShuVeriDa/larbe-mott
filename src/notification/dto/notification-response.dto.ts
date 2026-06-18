import { NotificationType } from '@prisma/client';

export class NotificationResponseDto {
  id: string;
  userId: string;
  type: NotificationType;
  entityId: string | null;
  title: string | null;
  body: string | null;
  isRead: boolean;
  createdAt: Date;
}
