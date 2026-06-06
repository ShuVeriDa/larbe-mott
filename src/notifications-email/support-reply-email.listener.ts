import { Inject, Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationType } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import type { Logger as WinstonLogger } from "winston";

import { NOTIFICATION_EVENTS } from "src/notification/notification-events";
import type { CreateNotificationPayload } from "src/notification/notification.service";
import { MailService } from "src/mail/mail.service";
import { PrismaService } from "src/prisma.service";

@Injectable()
export class SupportReplyEmailListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: WinstonLogger,
  ) {}

  @OnEvent(NOTIFICATION_EVENTS.CREATE)
  async handleNotificationCreate(payload: CreateNotificationPayload): Promise<void> {
    if (payload.type !== NotificationType.FEEDBACK_REPLY) return;

    try {
      const appUrl = this.config.getOrThrow<string>("FRONTEND_URL");

      const pref = await this.prisma.userNotificationPreferences.findUnique({
        where: { userId: payload.userId },
        include: {
          user: { select: { email: true, name: true } },
        },
      });

      if (!pref?.supportReplies) return;

      const threadUrl = `${appUrl}/feedback/${payload.entityId}`;

      await this.mail.sendSupportReplyEmail({
        to: pref.user.email,
        recipientName: pref.user.name,
        threadUrl,
      });
    } catch (e) {
      this.logger.error("[support-reply-email] failed to send email", {
        userId: payload.userId,
        entityId: payload.entityId,
        message: (e as Error).message,
      });
    }
  }
}
