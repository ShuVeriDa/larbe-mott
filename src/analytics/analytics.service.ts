import { Injectable } from "@nestjs/common";
import { UserEventType, WordStatus } from "@prisma/client";
import { PrismaService } from "src/prisma.service";

const WEEK_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export interface StreakDetails {
  current: number;
  record: number;
  weekDays: { date: string; label: string; active: boolean; isToday: boolean }[];
}

export interface WordStats {
  total: number;
  new: number;
  learning: number;
  known: number;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private dateKeyWithOffset(date: Date, offsetMinutes: number): string {
    return new Date(date.getTime() + offsetMinutes * 60_000)
      .toISOString()
      .slice(0, 10);
  }

  private utcDateKey(date: Date): string {
    return this.dateKeyWithOffset(date, 0);
  }

  private nowUtc(): Date {
    return new Date();
  }

  private parseUtcOffsetMinutes(timezone: string | null | undefined): number {
    if (!timezone) return 0;
    const normalized = timezone.trim().toUpperCase();
    const match = normalized.match(/^UTC([+-])(\d{1,2})(?::?(\d{2}))?$/);
    if (!match) return 0;

    const sign = match[1] === "+" ? 1 : -1;
    const hours = Number.parseInt(match[2], 10);
    const minutes = Number.parseInt(match[3] ?? "0", 10);

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
    if (hours > 14 || minutes > 59) return 0;

    return sign * (hours * 60 + minutes);
  }

  private addDaysToDateKey(dateKey: string, days: number): string {
    const d = new Date(`${dateKey}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  private async resolveTimezoneOffsetMinutes(userId: string): Promise<number> {
    const pref = await this.prisma.userNotificationPreferences.findUnique({
      where: { userId },
      select: { timezone: true },
    });
    return this.parseUtcOffsetMinutes(pref?.timezone);
  }

  async getUserAnalytics(userId: string) {
    const offsetMinutes = await this.resolveTimezoneOffsetMinutes(userId);
    const [wordStats, dueToday, textStats, streakDetails, activity] =
      await Promise.all([
        this.getWordStats(userId),
        this.getDueTodayCount(userId),
        this.getTextStats(userId),
        this.getStreakDetails(userId, offsetMinutes),
        this.getActivityLast30Days(userId),
      ]);

    return {
      words: wordStats,
      dueToday,
      texts: textStats,
      streak: streakDetails.current,
      streakRecord: streakDetails.record,
      streakDays: streakDetails.weekDays,
      activity,
    };
  }

  // ─── words ───────────────────────────────────────────────────────────────────

  async getWordStats(userId: string): Promise<WordStats> {
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
    const now = this.nowUtc();
    return this.prisma.userWordProgress.count({
      where: {
        userId,
        status: { not: WordStatus.KNOWN },
        OR: [{ nextReview: null }, { nextReview: { lte: now } }],
      },
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

  /**
   * Вычисляет все streak-данные за два параллельных запроса:
   * - current: текущая серия дней
   * - record: рекорд за всё время
   * - weekDays: активные дни текущей недели (Пн–Вс)
   */
  async getStreakDetails(userId: string, offsetMinutes?: number): Promise<StreakDetails> {
    const tzOffsetMinutes =
      offsetMinutes ?? (await this.resolveTimezoneOffsetMinutes(userId));
    const now = this.nowUtc();
    const today = this.dateKeyWithOffset(now, tzOffsetMinutes);
    const yesterday = this.addDaysToDateKey(today, -1);

    const shiftedNow = new Date(now.getTime() + tzOffsetMinutes * 60_000);

    // Границы текущей недели (Пн–Вс) в локальном времени пользователя.
    const dayOfWeek = shiftedNow.getUTCDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(shiftedNow);
    monday.setUTCDate(shiftedNow.getUTCDate() + mondayOffset);
    monday.setUTCHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    sunday.setUTCHours(23, 59, 59, 999);

    // Convert local week bounds back to UTC for DB query.
    const mondayUtc = new Date(monday.getTime() - tzOffsetMinutes * 60_000);
    const sundayUtc = new Date(sunday.getTime() - tzOffsetMinutes * 60_000);

    // Cap at 2 years — no streak can exceed this; avoids full-table scan for active users
    const twoYearsAgo = new Date(now);
    twoYearsAgo.setUTCFullYear(twoYearsAgo.getUTCFullYear() - 2);

    const [allEvents, weekEvents] = await Promise.all([
      this.prisma.userEvent.findMany({
        where: { userId, createdAt: { gte: twoYearsAgo } },
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.userEvent.findMany({
        where: { userId, createdAt: { gte: mondayUtc, lte: sundayUtc } },
        select: { createdAt: true },
      }),
    ]);

    // Уникальные дни, от новых к старым
    const uniqueDaysDesc = [
      ...new Set(allEvents.map((e) => this.dateKeyWithOffset(e.createdAt, tzOffsetMinutes))),
    ].sort().reverse();

    // Текущий streak
    let current = 0;
    if (uniqueDaysDesc.length && (uniqueDaysDesc[0] === today || uniqueDaysDesc[0] === yesterday)) {
      let expected = uniqueDaysDesc[0];
      for (const day of uniqueDaysDesc) {
        if (day === expected) {
          current++;
          expected = this.addDaysToDateKey(expected, -1);
        } else {
          break;
        }
      }
    }

    // Рекорд за всё время
    const uniqueDaysAsc = [...uniqueDaysDesc].sort();
    let record = uniqueDaysAsc.length > 0 ? 1 : 0;
    let run = uniqueDaysAsc.length > 0 ? 1 : 0;
    for (let i = 1; i < uniqueDaysAsc.length; i++) {
      if (this.addDaysToDateKey(uniqueDaysAsc[i - 1], 1) === uniqueDaysAsc[i]) {
        run++;
        if (run > record) record = run;
      } else {
        run = 1;
      }
    }

    // Дни текущей недели
    const activeDays = new Set(
      weekEvents.map((e) => this.dateKeyWithOffset(e.createdAt, tzOffsetMinutes)),
    );
    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setUTCDate(monday.getUTCDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      return {
        date: dateStr,
        label: WEEK_LABELS[i],
        active: activeDays.has(dateStr),
        isToday: dateStr === today,
      };
    });

    return { current, record, weekDays };
  }

  // ─── activity chart (last 30 days) ───────────────────────────────────────────

  private async getActivityLast30Days(
    userId: string,
  ): Promise<{ date: string; count: number }[]> {
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - 29);
    from.setUTCHours(0, 0, 0, 0);

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
      const day = this.utcDateKey(e.createdAt);
      counts[day] = (counts[day] ?? 0) + 1;
    }

    const result: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      const day = this.utcDateKey(d);
      result.push({ date: day, count: counts[day] ?? 0 });
    }

    return result;
  }
}
