import { Injectable } from "@nestjs/common";
import { UserEventType, WordStatus } from "@prisma/client";
import { PrismaService } from "src/prisma.service";

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserAnalytics(userId: string) {
    const [wordStats, dueToday, textStats, streak, activity] =
      await Promise.all([
        this.getWordStats(userId),
        this.getDueTodayCount(userId),
        this.getTextStats(userId),
        this.getStreak(userId),
        this.getActivityLast30Days(userId),
      ]);

    return { words: wordStats, dueToday, texts: textStats, streak, activity };
  }

  // ─── words ───────────────────────────────────────────────────────────────────

  private async getWordStats(userId: string) {
    const grouped = await this.prisma.userWordProgress.groupBy({
      by: ["status"],
      where: { userId },
      _count: { status: true },
    });

    const total = grouped.reduce((sum, g) => sum + g._count.status, 0);
    const map = Object.fromEntries(
      grouped.map((g) => [g.status, g._count.status]),
    ) as Partial<Record<WordStatus, number>>;

    return {
      total,
      new: map[WordStatus.NEW] ?? 0,
      learning: map[WordStatus.LEARNING] ?? 0,
      known: map[WordStatus.KNOWN] ?? 0,
    };
  }

  private async getDueTodayCount(userId: string): Promise<number> {
    return this.prisma.userWordProgress.count({
      where: { userId, nextReview: { lte: new Date() } },
    });
  }

  // ─── texts ───────────────────────────────────────────────────────────────────

  private async getTextStats(userId: string) {
    const texts = await this.prisma.userTextProgress.findMany({
      where: { userId },
      select: { progressPercent: true },
    });

    const opened = texts.length;
    const avgProgress =
      opened > 0
        ? Math.round(
            texts.reduce((sum, t) => sum + t.progressPercent, 0) / opened,
          )
        : 0;

    return { opened, avgProgress };
  }

  // ─── streak ──────────────────────────────────────────────────────────────────

  private async getStreak(userId: string): Promise<number> {
    const events = await this.prisma.userEvent.findMany({
      where: { userId },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    if (!events.length) return 0;

    const uniqueDays = [
      ...new Set(events.map((e) => e.createdAt.toISOString().slice(0, 10))),
    ].sort().reverse();

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000)
      .toISOString()
      .slice(0, 10);

    // Streak must be alive: last activity today or yesterday
    if (uniqueDays[0] !== today && uniqueDays[0] !== yesterday) return 0;

    let streak = 0;
    let expected = uniqueDays[0];

    for (const day of uniqueDays) {
      if (day === expected) {
        streak++;
        const d = new Date(expected);
        d.setDate(d.getDate() - 1);
        expected = d.toISOString().slice(0, 10);
      } else {
        break;
      }
    }

    return streak;
  }

  // ─── activity chart (last 30 days) ───────────────────────────────────────────

  private async getActivityLast30Days(
    userId: string,
  ): Promise<{ date: string; count: number }[]> {
    const from = new Date();
    from.setDate(from.getDate() - 29);
    from.setHours(0, 0, 0, 0);

    const events = await this.prisma.userEvent.findMany({
      where: {
        userId,
        type: {
          in: [UserEventType.CLICK_WORD, UserEventType.ADD_TO_DICTIONARY],
        },
        createdAt: { gte: from },
      },
      select: { createdAt: true },
    });

    const counts: Record<string, number> = {};
    for (const e of events) {
      const day = e.createdAt.toISOString().slice(0, 10);
      counts[day] = (counts[day] ?? 0) + 1;
    }

    const result: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const day = d.toISOString().slice(0, 10);
      result.push({ date: day, count: counts[day] ?? 0 });
    }

    return result;
  }
}
