import { Inject, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { UserStatus } from "@prisma/client";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import type { Logger as WinstonLogger } from "winston";

import { MailService } from "src/mail/mail.service";
import { PrismaService } from "src/prisma.service";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class WeeklyReportTask {
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: WinstonLogger,
  ) {}

  // Every Monday at 07:00 UTC.
  @Cron("0 7 * * 1", { name: "weekly-report" })
  async run() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      await this.dispatch();
    } catch (e) {
      this.logger.error("[weekly-report] task failed", { message: (e as Error).message });
    } finally {
      this.isRunning = false;
    }
  }

  private async dispatch() {
    const appUrl = this.config.getOrThrow<string>("FRONTEND_URL");
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const prefs = await this.prisma.userNotificationPreferences.findMany({
      where: { weeklyReport: true },
      include: {
        user: {
          select: { id: true, email: true, name: true, status: true },
        },
      },
    });

    let sent = 0;

    for (const batch of chunk(prefs, 100)) {
      for (const pref of batch) {
        if (pref.user.status === UserStatus.DELETED) continue;

        const [newWordsCount, reviewedWordsCount] = await Promise.all([
          this.prisma.userWordProgress.count({
            where: { userId: pref.userId, lastSeen: { gte: weekAgo } },
          }),
          this.prisma.userReviewLog.count({
            where: { userId: pref.userId, createdAt: { gte: weekAgo } },
          }),
        ]);

        if (newWordsCount === 0 && reviewedWordsCount === 0) continue;

        await this.mail.sendWeeklyReportEmail({
          to: pref.user.email,
          recipientName: pref.user.name,
          newWordsCount,
          reviewedWordsCount,
          streakDays: 0,
          appUrl,
        });

        sent++;
      }

      await sleep(100);
    }

    if (sent > 0) {
      this.logger.info("[weekly-report] emails sent", { sent });
    }
  }
}

const chunk = <T>(arr: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
