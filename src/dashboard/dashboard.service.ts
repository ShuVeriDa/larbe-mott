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
    // Fetch subscription once and share it across plan snapshot and the response.
    const [stats, continueReading, dictionaryStats, translationsToday, user, subscription] =
      await Promise.all([
        this.analyticsService.getUserAnalytics(userId),
        this.textService.getContinueReading(userId),
        this.getDictionaryStats(userId),
        this.getTranslationsToday(userId),
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
      plan: this.buildPlanSnapshot(subscription, translationsToday),
    };
  }

  private async getDictionaryStats(userId: string) {
    const agg = await this.prisma.userDictionaryEntry.aggregate({
      where: { userId },
      _count: true,
    });
    return { total: agg._count };
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
