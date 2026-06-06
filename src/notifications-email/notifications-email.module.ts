import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { MailModule } from "src/mail/mail.module";
import { PrismaService } from "src/prisma.service";

import { RepeatReminderTask } from "./repeat-reminder.task";
import { WeeklyReportTask } from "./weekly-report.task";
import { NewTextsTask } from "./new-texts.task";
import { SupportReplyEmailListener } from "./support-reply-email.listener";

@Module({
  imports: [MailModule, ConfigModule],
  providers: [
    PrismaService,
    RepeatReminderTask,
    WeeklyReportTask,
    NewTextsTask,
    SupportReplyEmailListener,
  ],
})
export class NotificationsEmailModule {}
