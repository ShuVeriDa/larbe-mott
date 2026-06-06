import { Inject, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Language, UserStatus } from "@prisma/client";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import type { Logger as WinstonLogger } from "winston";

import { MailService } from "src/mail/mail.service";
import { PrismaService } from "src/prisma.service";
import { ConfigService } from "@nestjs/config";

const LANG_SLUG: Record<Language, string> = {
  [Language.CHE]: "che",
  [Language.RU]: "ru",
  [Language.EN]: "en",
  [Language.AR]: "ar",
};

@Injectable()
export class NewTextsTask {
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: WinstonLogger,
  ) {}

  // Every day at 10:00 UTC.
  @Cron("0 10 * * *", { name: "new-texts-notification" })
  async run() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      await this.dispatch();
    } catch (e) {
      this.logger.error("[new-texts] task failed", { message: (e as Error).message });
    } finally {
      this.isRunning = false;
    }
  }

  private async dispatch() {
    const appUrl = this.config.getOrThrow<string>("FRONTEND_URL");
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentTexts = await this.prisma.text.findMany({
      where: { publishedAt: { gte: dayAgo, not: null } },
      select: { id: true, title: true, language: true },
    });

    if (recentTexts.length === 0) return;

    // Group by language for quick lookup
    const byLanguage = new Map<Language, typeof recentTexts>();
    for (const t of recentTexts) {
      const existing = byLanguage.get(t.language) ?? [];
      existing.push(t);
      byLanguage.set(t.language, existing);
    }

    const prefs = await this.prisma.userNotificationPreferences.findMany({
      where: { newTexts: true },
      include: {
        user: {
          select: { id: true, email: true, name: true, status: true, language: true },
        },
      },
    });

    let sent = 0;

    for (const batch of chunk(prefs, 100)) {
      for (const pref of batch) {
        if (pref.user.status === UserStatus.DELETED) continue;

        const userLang = pref.user.language;
        if (!userLang) continue;

        const matching = byLanguage.get(userLang);
        if (!matching || matching.length === 0) continue;

        const langSlug = LANG_SLUG[userLang];
        const texts = matching.slice(0, 5).map((t) => ({
          title: t.title,
          url: `${appUrl}/${langSlug}/texts/${t.id}`,
        }));

        await this.mail.sendNewTextsEmail({
          to: pref.user.email,
          recipientName: pref.user.name,
          texts,
          appUrl: `${appUrl}/${langSlug}/texts`,
        });

        sent++;
      }

      await sleep(100);
    }

    if (sent > 0) {
      this.logger.info("[new-texts] emails sent", { sent });
    }
  }
}

const chunk = <T>(arr: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
