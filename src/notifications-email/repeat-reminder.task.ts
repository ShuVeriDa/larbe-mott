import { Inject, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { UserStatus } from "@prisma/client";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import type { Logger as WinstonLogger } from "winston";

import { MailService } from "src/mail/mail.service";
import { PrismaService } from "src/prisma.service";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class RepeatReminderTask {
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: WinstonLogger,
  ) {}

  // Runs every hour at :00. Dispatches to users whose reminderTime matches
  // the current hour in their local timezone.
  @Cron("0 * * * *", { name: "repeat-reminder" })
  async run() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      await this.dispatch();
    } catch (e) {
      this.logger.error("[repeat-reminder] task failed", { message: (e as Error).message });
    } finally {
      this.isRunning = false;
    }
  }

  private async dispatch() {
    const appUrl = this.config.getOrThrow<string>("FRONTEND_URL");
    const nowUtc = new Date();

    const prefs = await this.prisma.userNotificationPreferences.findMany({
      where: { repeatReminder: true },
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
        if (!this.isCurrentHour(pref.reminderTime, pref.timezone, nowUtc)) continue;

        const dueCount = await this.prisma.userWordProgress.count({
          where: { userId: pref.userId, nextReview: { lte: nowUtc } },
        });

        if (dueCount === 0) continue;

        await this.mail.sendRepeatReminderEmail({
          to: pref.user.email,
          recipientName: pref.user.name,
          dueCount,
          appUrl,
        });

        sent++;
      }

      await sleep(100);
    }

    if (sent > 0) {
      this.logger.info("[repeat-reminder] emails sent", { sent });
    }
  }

  private isCurrentHour(reminderTime: string, timezone: string, nowUtc: Date): boolean {
    try {
      const localHour = getLocalHour(nowUtc, timezone);
      const [targetHour] = reminderTime.split(":").map(Number);
      return localHour === targetHour;
    } catch {
      return false;
    }
  }
}

const getLocalHour = (utc: Date, timezone: string): number => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  });
  return parseInt(formatter.format(utc), 10);
};

const chunk = <T>(arr: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
