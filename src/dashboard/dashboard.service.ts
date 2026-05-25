import { Injectable } from "@nestjs/common";
import { AnalyticsService } from "src/analytics/analytics.service";
import { PrismaService } from "src/prisma.service";
import { SubscriptionService } from "src/subscription/subscription.service";
import { TextService } from "src/text/text.service";
import { UserService } from "src/user/user.service";

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
    const [stats, continueReading, dictionaryStats, plan, user, subscription] =
      await Promise.all([
        this.analyticsService.getUserAnalytics(userId),
        this.textService.getContinueReading(userId),
        this.getDictionaryStats(userId),
        this.getPlanSnapshot(userId),
        this.userService.getUserById(userId),
        this.subscriptionService.getMySubscription(userId),
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
      },
      continueReading,
      plan,
    };
  }

  private async getDictionaryStats(userId: string) {
    const agg = await this.prisma.userDictionaryEntry.aggregate({
      where: { userId },
      _count: true,
    });
    return { total: agg._count };
  }

  /**
   * Минимально достаточный для сайдбарной плашки тарифа снимок:
   * текущий план + дневное использование переводов и его лимит.
   * Позволяет фронту нарисовать главную одним запросом.
   */
  private async getPlanSnapshot(userId: string) {
    const usage = await this.subscriptionService.getUsage(userId);
    const subscription = await this.subscriptionService.getMySubscription(userId);

    const limits = (usage.limits ?? {}) as Record<string, unknown>;
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
      translationsToday: usage.translationsToday,
      translationsLimit,
    };
  }
}
