import { Injectable } from "@nestjs/common";
import { Level } from "@prisma/client";
import { AnalyticsService } from "src/analytics/analytics.service";
import { PrismaService } from "src/prisma.service";
import { SubscriptionService } from "src/subscription/subscription.service";
import { TextService } from "src/text/text.service";
import { UserService } from "src/user/user.service";

const SHORT_TEXT_MAX_WORDS = 400;
const SECTION_LIMIT = 10;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
    private readonly textService: TextService,
    private readonly subscriptionService: SubscriptionService,
    private readonly userService: UserService,
  ) {}

  async getDashboard(userId: string) {
    const user = await this.userService.getUserById(userId);
    const userLevel = user?.level ?? null;

    const [
      stats,
      continueReading,
      dictionaryStats,
      translationsToday,
      wordsAddedToday,
      subscription,
      recentTexts,
      popularTexts,
      shortTexts,
      byLevelTexts,
    ] = await Promise.all([
      this.analyticsService.getUserAnalytics(userId),
      this.textService.getContinueReading(userId),
      this.getDictionaryStats(userId),
      this.getTranslationsToday(userId),
      this.getWordsAddedToday(userId),
      this.subscriptionService.getMySubscription(userId),
      // Recent texts — newest first
      this.textService.getTexts({ orderBy: "newest", limit: SECTION_LIMIT }, userId),
      // Popular texts — by reader count
      this.textService.getTexts({ orderBy: "popular", limit: SECTION_LIMIT }, userId),
      // Short texts — up to SHORT_TEXT_MAX_WORDS words, sorted shortest first
      this.textService.getTexts(
        { orderBy: "length", limit: SECTION_LIMIT * 2, maxWords: SHORT_TEXT_MAX_WORDS },
        userId,
      ),
      // Texts matching user's level (null → skip)
      userLevel
        ? this.textService.getTexts(
            { orderBy: "newest", levels: [userLevel as Level], limit: SECTION_LIMIT },
            userId,
          )
        : Promise.resolve(null),
    ]);

    return {
      user,
      subscription,
      stats: {
        textsRead: stats.texts.opened,
        wordsInDictionary: dictionaryStats.total,
        streak: stats.streak,
        streakRecord: stats.streakRecord,
        streakDays: stats.streakDays,
        dueToday: stats.dueToday,
        words: stats.words,
        wordsAddedToday,
      },
      continueReading,
      plan: this.buildPlanSnapshot(subscription, translationsToday),
      sections: {
        recentTexts: recentTexts.items,
        popularTexts: popularTexts.items,
        shortTexts: shortTexts.items.slice(0, SECTION_LIMIT),
        byLevelTexts: byLevelTexts?.items ?? [],
        userLevel,
      },
    };
  }

  private async getDictionaryStats(userId: string) {
    const agg = await this.prisma.userDictionaryEntry.aggregate({
      where: { userId },
      _count: true,
    });
    return { total: agg._count };
  }

  private async getWordsAddedToday(userId: string): Promise<number> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return this.prisma.userDictionaryEntry.count({
      where: { userId, addedAt: { gte: todayStart } },
    });
  }

  private async getTranslationsToday(userId: string): Promise<number> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return this.prisma.userEvent.count({
      where: { userId, type: "CLICK_WORD", createdAt: { gte: todayStart } },
    });
  }

  private buildPlanSnapshot(
    subscription: Awaited<ReturnType<SubscriptionService["getMySubscription"]>>,
    translationsToday: number,
  ) {
    const limits = (subscription?.plan?.limits ?? {}) as Record<string, unknown>;
    const translationsLimit =
      typeof limits.translationsPerDay === "number"
        ? (limits.translationsPerDay as number)
        : null;

    return {
      code: subscription?.plan?.code ?? "FREE",
      name: subscription?.plan?.name ?? "Бесплатный план",
      type: subscription?.plan?.type ?? "FREE",
      status: subscription?.status ?? null,
      isPremium: !!subscription && subscription.plan?.type !== "FREE",
      translationsToday,
      translationsLimit,
    };
  }
}
