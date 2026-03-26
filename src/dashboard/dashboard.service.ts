import { Injectable } from "@nestjs/common";
import { AnalyticsService } from "src/analytics/analytics.service";
import { PrismaService } from "src/prisma.service";
import { TextService } from "src/text/text.service";

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
    private readonly textService: TextService,
  ) {}

  async getDashboard(userId: string) {
    const [stats, continueReading, dictionaryStats] = await Promise.all([
      this.analyticsService.getUserAnalytics(userId),
      this.textService.getContinueReading(userId),
      this.getDictionaryStats(userId),
    ]);

    return {
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
    };
  }

  private async getDictionaryStats(userId: string) {
    const agg = await this.prisma.userDictionaryEntry.aggregate({
      where: { userId },
      _count: true,
    });
    return { total: agg._count };
  }
}
