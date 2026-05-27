import { Injectable } from "@nestjs/common";
import { Prisma, PhraseStatus, UserEventType } from "@prisma/client";
import { AnalyticsService } from "src/analytics/analytics.service";
import { PrismaService } from "src/prisma.service";
import { StatPeriod } from "./dto/statistics-query.dto";

interface DateRange {
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
}

const MONTH_LABELS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
const STREAK_MILESTONES = [3, 7, 14, 30];
const READ_SESSION = "READ_SESSION" as UserEventType;
const REVIEW_SESSION = "REVIEW_SESSION" as UserEventType;

@Injectable()
export class StatisticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  private utcDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  // ─── Main entry point ────────────────────────────────────────────────────────

  async getUserStatistics(
    userId: string,
    period: StatPeriod,
    opts: { activityLimit?: number } = {},
  ) {
    const range = this.buildRange(period);
    const activityLimit = opts.activityLimit ?? 15;

    const [
      wordsLearned,
      readingTimeMinutes,
      reviews,
      textsRead,
      streak,
      heatmap,
      heatmapWeek,
      wordStats,
      goals,
      wordsPerDay,
      texts,
      accuracy,
      recentActivity,
      phraseProgress,
      phrasesPerDay,
      phraseAccuracy,
      eventsChart,
      vocabularyGrowth,
      achievements,
      goalForecast,
      reviewSessions,
      retention,
      topWords,
      weekdayActivity,
      readingSpeed,
      weakSpots,
      kpiSparklines,
    ] = await Promise.all([
      this.getWordsLearned(userId, range, period),
      this.getReadingTime(userId, range, period),
      this.getReviews(userId, range, period),
      this.getTextsRead(userId, range, period),
      this.getStreak(userId),
      this.getYearHeatmap(userId, range, period),
      this.getWeekHourHeatmap(userId, range, period),
      this.analyticsService.getWordStats(userId),
      this.prisma.userGoals.findUnique({
        where: { userId },
        select: { vocabularyGoal: true },
      }),
      this.getWordsPerDay(userId, range, period),
      this.getTextsProgress(userId),
      this.getAccuracy(userId, range, period),
      this.getRecentActivity(userId, range, activityLimit),
      this.getPhraseProgress(userId),
      this.getPhrasesPerDay(userId, range, period),
      this.getPhraseAccuracy(userId, range, period),
      this.getEventsChart(userId, range, period),
      this.getVocabularyGrowth(userId, range, period),
      this.getAchievements(userId),
      this.getGoalForecast(userId),
      this.getReviewSessions(userId, range, period),
      this.getRetention(userId),
      this.getTopWords(userId, range, period),
      this.getWeekdayActivity(userId, range, period),
      this.getReadingSpeed(userId, range, period),
      this.getWeakSpots(userId),
      this.getKpiSparklines(userId),
    ]);

    const words = { ...wordStats, goal: goals?.vocabularyGoal ?? 800 };

    return {
      period,
      header: { wordsLearned, readingTimeMinutes, reviews, textsRead },
      streak,
      heatmap,
      heatmapWeek,
      words,
      wordsPerDay,
      texts,
      accuracy,
      recentActivity,
      phraseProgress,
      phrasesPerDay,
      phraseAccuracy,
      eventsChart,
      vocabularyGrowth,
      achievements,
      goalForecast,
      reviewSessions,
      retention,
      topWords,
      weekdayActivity,
      readingSpeed,
      weakSpots,
      kpiSparklines,
    };
  }

  // ─── Profile summary (Free + Premium) ────────────────────────────────────────
  // Минимальный набор статистики для страницы /profile (доступен ВСЕМ юзерам, без Premium).
  // Полный /statistics/me остаётся под @RequiresPremium().

  async getProfileSummary(userId: string) {
    const [wordStats, streakDetails, textsRead, heatmap] = await Promise.all([
      this.analyticsService.getWordStats(userId),
      this.analyticsService.getStreakDetails(userId),
      this.prisma.userTextProgress.count({
        where: { userId, completedAt: { not: null } },
      }),
      this.getProfileHeatmap(userId),
    ]);

    return {
      words: wordStats, // { total, new, learning, known }
      textsRead,
      streak: { current: streakDetails.current, record: streakDetails.record },
      heatmap, // плоский массив 70 ячеек: [{ date, level, count }]
    };
  }

  /** Последние 70 дней активности — flat-массив для UI heatmap на /profile. */
  private async getProfileHeatmap(userId: string) {
    const days = 70;
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - (days - 1));
    from.setUTCHours(0, 0, 0, 0);

    const events = await this.prisma.userEvent.findMany({
      where: {
        userId,
        type: { in: [UserEventType.CLICK_WORD, UserEventType.ADD_TO_DICTIONARY] },
        createdAt: { gte: from },
      },
      select: { createdAt: true },
    });

    const countByDay: Record<string, number> = {};
    for (const e of events) {
      const day = this.utcDateKey(e.createdAt);
      countByDay[day] = (countByDay[day] ?? 0) + 1;
    }

    const toLevel = (n: number): 0 | 1 | 2 | 3 | 4 => {
      if (n === 0) return 0;
      if (n <= 5) return 1;
      if (n <= 15) return 2;
      if (n <= 30) return 3;
      return 4;
    };

    return Array.from({ length: days }, (_, i) => {
      const d = new Date(from);
      d.setUTCDate(from.getUTCDate() + i);
      const key = this.utcDateKey(d);
      const count = countByDay[key] ?? 0;
      return { date: key, level: toLevel(count), count };
    });
  }

  // ─── Period range ────────────────────────────────────────────────────────────

  private buildRange(period: StatPeriod): DateRange {
    const now = new Date();
    const to = new Date(now);

    if (period === StatPeriod.ALL) {
      const epoch = new Date(0);
      return { from: epoch, to, prevFrom: epoch, prevTo: epoch };
    }

    const days = period === StatPeriod.WEEK ? 7 : period === StatPeriod.MONTH ? 30 : 365;

    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - days);
    from.setUTCHours(0, 0, 0, 0);

    const prevTo = new Date(from);
    const prevFrom = new Date(from);
    prevFrom.setUTCDate(prevFrom.getUTCDate() - days);
    prevFrom.setUTCHours(0, 0, 0, 0);

    return { from, to, prevFrom, prevTo };
  }

  private periodWhere(period: StatPeriod, range: DateRange) {
    return period !== StatPeriod.ALL
      ? { createdAt: { gte: range.from, lte: range.to } }
      : {};
  }

  // ─── Header: words learned ───────────────────────────────────────────────────

  private async getWordsLearned(userId: string, range: DateRange, period: StatPeriod) {
    const [total, prev] = await Promise.all([
      this.prisma.userEvent.count({
        where: { userId, type: UserEventType.ADD_TO_DICTIONARY, ...this.periodWhere(period, range) },
      }),
      period !== StatPeriod.ALL
        ? this.prisma.userEvent.count({
            where: {
              userId,
              type: UserEventType.ADD_TO_DICTIONARY,
              createdAt: { gte: range.prevFrom, lt: range.prevTo },
            },
          })
        : Promise.resolve(null as number | null),
    ]);

    return { total, delta: prev !== null ? total - prev : null };
  }

  // ─── Header: reading time ────────────────────────────────────────────────────

  private async getReadingTime(userId: string, range: DateRange, period: StatPeriod) {
    const sumMinutes = async (from: Date, to: Date): Promise<number> => {
      const result = await this.prisma.$queryRaw<[{ seconds: string | null }]>`
        SELECT SUM((metadata->>'durationSeconds')::float) AS seconds
        FROM "user_event"
        WHERE "userId" = ${userId}
          AND type::text = 'READ_SESSION'
          AND "createdAt" >= ${from}
          AND "createdAt" <= ${to}
      `;
      return Math.round((parseFloat(result[0]?.seconds ?? "0") || 0) / 60);
    };

    const [total, prevOrNull] = await Promise.all([
      sumMinutes(range.from, range.to),
      period !== StatPeriod.ALL
        ? sumMinutes(range.prevFrom, range.prevTo)
        : Promise.resolve<number | null>(null),
    ]);

    const delta = prevOrNull !== null ? total - prevOrNull : null;
    return { total, delta };
  }

  // ─── Header: reviews ─────────────────────────────────────────────────────────

  private async getReviews(userId: string, range: DateRange, period: StatPeriod) {
    const [total, prev] = await Promise.all([
      this.prisma.userReviewLog.count({
        where: { userId, ...this.periodWhere(period, range) },
      }),
      period !== StatPeriod.ALL
        ? this.prisma.userReviewLog.count({
            where: { userId, createdAt: { gte: range.prevFrom, lt: range.prevTo } },
          })
        : Promise.resolve(null as number | null),
    ]);

    return { total, delta: prev !== null ? total - prev : null };
  }

  // ─── Header: texts read ──────────────────────────────────────────────────────
  // Counts texts the user finished (progressPercent reached 100%) within the range.
  // Uses UserTextProgress.completedAt — set once on first completion.

  private async getTextsRead(userId: string, range: DateRange, period: StatPeriod) {
    const completedWhere =
      period !== StatPeriod.ALL
        ? { userId, completedAt: { gte: range.from, lte: range.to } }
        : { userId, completedAt: { not: null } };

    const [total, prev] = await Promise.all([
      this.prisma.userTextProgress.count({ where: completedWhere }),
      period !== StatPeriod.ALL
        ? this.prisma.userTextProgress.count({
            where: { userId, completedAt: { gte: range.prevFrom, lt: range.prevTo } },
          })
        : Promise.resolve(null as number | null),
    ]);

    return { total, delta: prev !== null ? total - prev : null };
  }

  // ─── Streak ──────────────────────────────────────────────────────────────────
  // Делегируем в AnalyticsService, добавляем только milestones

  private async getStreak(userId: string) {
    const { current, record, weekDays } = await this.analyticsService.getStreakDetails(userId);
    const milestones = STREAK_MILESTONES.map((days) => ({ days, reached: current >= days }));
    return { current, record, weekDays, milestones };
  }

  // ─── Year heatmap ────────────────────────────────────────────────────────────

  private async getYearHeatmap(userId: string, range: DateRange, period: StatPeriod) {
    const toLevel = (n: number): 0 | 1 | 2 | 3 | 4 => {
      if (n === 0) return 0;
      if (n <= 5) return 1;
      if (n <= 15) return 2;
      if (n <= 30) return 3;
      return 4;
    };

    if (period === StatPeriod.YEAR) {
      // Last 12 months
      const from = new Date();
      from.setUTCFullYear(from.getUTCFullYear() - 1);
      from.setUTCHours(0, 0, 0, 0);

      const events = await this.prisma.userEvent.findMany({
        where: {
          userId,
          type: { in: [UserEventType.CLICK_WORD, UserEventType.ADD_TO_DICTIONARY] },
          createdAt: { gte: from },
        },
        select: { createdAt: true },
      });

      const countByDay: Record<string, number> = {};
      for (const e of events) {
        const day = this.utcDateKey(e.createdAt);
        countByDay[day] = (countByDay[day] ?? 0) + 1;
      }

      const now = new Date();
      return Array.from({ length: 12 }, (_, i) => {
        const monthDate = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
        const year = monthDate.getFullYear();
        const month = monthDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const days = Array.from({ length: daysInMonth }, (_, d) => {
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`;
          const count = countByDay[dateStr] ?? 0;
          return { date: dateStr, level: toLevel(count), count };
        });

        return { month: MONTH_LABELS[month], days };
      });
    }

    if (period === StatPeriod.ALL) {
      // All time: cap at 3 years back to avoid unbounded table scan for active users
      const allTimeFrom = new Date();
      allTimeFrom.setUTCFullYear(allTimeFrom.getUTCFullYear() - 3);
      allTimeFrom.setUTCHours(0, 0, 0, 0);

      const events = await this.prisma.userEvent.findMany({
        where: {
          userId,
          type: { in: [UserEventType.CLICK_WORD, UserEventType.ADD_TO_DICTIONARY] },
          createdAt: { gte: allTimeFrom },
        },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      });

      const countByDay: Record<string, number> = {};
      for (const e of events) {
        const day = this.utcDateKey(e.createdAt);
        countByDay[day] = (countByDay[day] ?? 0) + 1;
      }

      if (Object.keys(countByDay).length === 0) {
        // No data — return last 12 months empty
        const now = new Date();
        return Array.from({ length: 12 }, (_, i) => {
          const monthDate = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
          const year = monthDate.getFullYear();
          const month = monthDate.getMonth();
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const days = Array.from({ length: daysInMonth }, (_, d) => {
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`;
            return { date: dateStr, level: toLevel(0) as 0 | 1 | 2 | 3 | 4, count: 0 };
          });
          return { month: MONTH_LABELS[month], days };
        });
      }

      // Determine full date range from first event to today
      const allDates = Object.keys(countByDay).sort();
      const firstDate = new Date(allDates[0]);
      const now = new Date();

      // Build a map of year-month → days
      const monthMap = new Map<string, { year: number; month: number; days: { date: string; level: 0|1|2|3|4; count: number }[] }>();

      const cursor = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth(), 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

      while (cursor < end) {
        const year = cursor.getUTCFullYear();
        const month = cursor.getUTCMonth();
        const key = `${year}-${month}`;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days = Array.from({ length: daysInMonth }, (_, d) => {
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`;
          const count = countByDay[dateStr] ?? 0;
          return { date: dateStr, level: toLevel(count) as 0|1|2|3|4, count };
        });
        monthMap.set(key, { year, month, days });
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }

      return Array.from(monthMap.values())
        .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
        .map(({ month, days }) => ({ month: `${MONTH_LABELS[month]}`, days }));
    }

    // Week (7 days) or Month (30 days) — show only the period days as a single "row"
    const days = period === StatPeriod.WEEK ? 7 : 30;
    const from = new Date(range.from);

    const events = await this.prisma.userEvent.findMany({
      where: {
        userId,
        type: { in: [UserEventType.CLICK_WORD, UserEventType.ADD_TO_DICTIONARY] },
        createdAt: { gte: from },
      },
      select: { createdAt: true },
    });

    const countByDay: Record<string, number> = {};
    for (const e of events) {
      const day = this.utcDateKey(e.createdAt);
      countByDay[day] = (countByDay[day] ?? 0) + 1;
    }

    const periodDays = Array.from({ length: days }, (_, i) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - (days - 1 - i));
      const dateStr = this.utcDateKey(d);
      const count = countByDay[dateStr] ?? 0;
      return { date: dateStr, level: toLevel(count), count };
    });

    // Group by month for display
    const monthMap = new Map<string, { month: string; days: typeof periodDays }>();
    for (const day of periodDays) {
      const [year, monthIdx] = [parseInt(day.date.slice(0, 4)), parseInt(day.date.slice(5, 7)) - 1];
      const key = `${year}-${monthIdx}`;
      if (!monthMap.has(key)) {
        monthMap.set(key, { month: MONTH_LABELS[monthIdx], days: [] });
      }
      monthMap.get(key)!.days.push(day);
    }

    return Array.from(monthMap.values());
  }

  // ─── Words per day ────────────────────────────────────────────────────────────

  private async getWordsPerDay(userId: string, range: DateRange, period: StatPeriod) {
    const daysBack = period === StatPeriod.WEEK ? 7 : period === StatPeriod.MONTH ? 30 : 365;
    const from = period === StatPeriod.ALL
      ? (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d; })()
      : range.from;

    const events = await this.prisma.userEvent.findMany({
      where: {
        userId,
        type: { in: [UserEventType.CLICK_WORD, UserEventType.ADD_TO_DICTIONARY] },
        createdAt: { gte: from },
      },
      select: { createdAt: true },
    });

    const countByDay: Record<string, number> = {};
    for (const e of events) {
      const day = e.createdAt.toISOString().slice(0, 10);
      countByDay[day] = (countByDay[day] ?? 0) + 1;
    }

    const count = Math.min(daysBack, 365);
    return Array.from({ length: count }, (_, i) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - (count - 1 - i));
      const day = this.utcDateKey(d);
      return { date: day, count: countByDay[day] ?? 0 };
    });
  }

  // ─── Texts progress ───────────────────────────────────────────────────────────

  private async getTextsProgress(userId: string) {
    const progressRows = await this.prisma.userTextProgress.findMany({
      where: { userId },
      orderBy: { lastOpened: "desc" },
      include: {
        text: { select: { id: true, title: true, imageUrl: true, level: true, language: true } },
      },
    });

    if (!progressRows.length) return [];

    const textIds = progressRows.map((r) => r.textId);
    const wordCountRows = await this.prisma.$queryRaw<
      { textId: string; wordCount: number }[]
    >(
      Prisma.sql`
        SELECT t.id AS "textId", COALESCE(COUNT(tt.id), 0)::int AS "wordCount"
        FROM "text" t
        LEFT JOIN LATERAL (
          SELECT tpv.id
          FROM "text_processing_version" tpv
          WHERE tpv."textId" = t.id
          ORDER BY tpv.version DESC
          LIMIT 1
        ) lv ON true
        LEFT JOIN "text_token" tt ON tt."versionId" = lv.id
        WHERE t.id IN (${Prisma.join(textIds)})
        GROUP BY t.id
      `,
    );
    const wordCountByTextId = new Map(
      wordCountRows.map((row) => [row.textId, Number(row.wordCount) || 0]),
    );

    return progressRows.map((r) => {
      const wordCount = wordCountByTextId.get(r.textId) ?? 0;
      const progressPercent = Math.round(r.progressPercent);
      const knownWords = Math.round((progressPercent / 100) * wordCount);

      return {
        id: r.text.id,
        title: r.text.title,
        imageUrl: r.text.imageUrl,
        level: r.text.level,
        language: r.text.language,
        wordCount,
        progressPercent,
        knownWords,
        lastOpened: r.lastOpened?.toISOString() ?? null,
      };
    });
  }

  // ─── Review accuracy ──────────────────────────────────────────────────────────

  private async getAccuracy(userId: string, range: DateRange, period: StatPeriod) {
    const [logs, sessions] = await Promise.all([
      this.prisma.userReviewLog.findMany({
        where: { userId, ...this.periodWhere(period, range) },
        orderBy: { createdAt: "asc" },
        select: { correct: true },
      }),
      this.prisma.userEvent.count({
        where: { userId, type: REVIEW_SESSION, ...this.periodWhere(period, range) },
      }),
    ]);

    const correct = logs.filter((l) => l.correct).length;
    const wrong = logs.length - correct;
    const percent = logs.length > 0 ? Math.round((correct / logs.length) * 100) : 0;

    let bestStreak = 0;
    let cur = 0;
    for (const log of logs) {
      if (log.correct) {
        cur++;
        if (cur > bestStreak) bestStreak = cur;
      } else {
        cur = 0;
      }
    }

    return { percent, correct, wrong, bestStreak, sessions };
  }

  // ─── Recent activity ──────────────────────────────────────────────────────────

  private async getRecentActivity(userId: string, range: DateRange, limit: number) {
    // Pull a bit more raw events than `limit` to compensate for dedup/collapse,
    // capped to keep the in-memory pass small.
    const fetchLimit = Math.min(100, Math.max(limit * 3, 30));
    const events = await this.prisma.userEvent.findMany({
      where: {
        userId,
        type: { in: [UserEventType.OPEN_TEXT, UserEventType.ADD_TO_DICTIONARY, REVIEW_SESSION] },
        createdAt: { gte: range.from },
      },
      orderBy: { createdAt: "desc" },
      take: fetchLimit,
      select: { id: true, type: true, metadata: true, createdAt: true },
    });

    if (!events.length) return [];

    // Fetch titles for OPEN_TEXT events
    const textIds = [
      ...new Set(
        events
          .filter((e) => e.type === UserEventType.OPEN_TEXT)
          .map((e) => (e.metadata as { textId?: string } | null)?.textId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const titleByTextId = new Map<string, string>();
    if (textIds.length) {
      const texts = await this.prisma.text.findMany({
        where: { id: { in: textIds } },
        select: { id: true, title: true },
      });
      for (const t of texts) titleByTextId.set(t.id, t.title);
    }

    // Group ADD_TO_DICTIONARY by day
    const addByDay = new Map<string, number>();
    const addDayOrder: string[] = [];
    for (const e of events) {
      if (e.type !== UserEventType.ADD_TO_DICTIONARY) continue;
      const day = this.utcDateKey(e.createdAt);
      if (!addByDay.has(day)) addDayOrder.push(day);
      addByDay.set(day, (addByDay.get(day) ?? 0) + 1);
    }

    // Build activity list (deduplicate OPEN_TEXT by day+textId, collapse ADD_TO_DICTIONARY by day)
    const seenOpenText = new Set<string>();
    const seenAddDay = new Set<string>();
    const result: object[] = [];

    for (const e of events) {
      const meta = e.metadata as Record<string, unknown> | null;

      if (e.type === UserEventType.OPEN_TEXT) {
        const textId = meta?.textId as string | undefined;
        const day = this.utcDateKey(e.createdAt);
        const key = `${textId}:${day}`;
        if (seenOpenText.has(key)) continue;
        seenOpenText.add(key);

        const textTitle = textId ? (titleByTextId.get(textId) ?? null) : null;
        const pageNumber = meta?.pageNumber as number | undefined ?? null;
        result.push({
          type: "READ_TEXT",
          date: e.createdAt.toISOString(),
          icon: "text",
          meta: { textTitle, pageNumber },
        });
      } else if (e.type === UserEventType.ADD_TO_DICTIONARY) {
        const day = this.utcDateKey(e.createdAt);
        if (seenAddDay.has(day)) continue;
        seenAddDay.add(day);

        const count = addByDay.get(day) ?? 1;
        result.push({
          type: "ADD_WORDS",
          date: e.createdAt.toISOString(),
          icon: "word",
          meta: { count },
        });
      } else if (e.type === REVIEW_SESSION) {
        const correct = meta?.correct as number | undefined ?? 0;
        const wrong = meta?.wrong as number | undefined ?? 0;
        const total = correct + wrong;
        const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
        result.push({
          type: "REVIEW",
          date: e.createdAt.toISOString(),
          icon: "review",
          meta: { total, accuracy },
        });
      }

      if (result.length >= limit) break;
    }

    return result;
  }

  // ─── Week hour heatmap ────────────────────────────────────────────────────────
  // Returns 7 days × 24 hours grid. Only meaningful for WEEK; returns empty for other periods.

  private async getWeekHourHeatmap(userId: string, range: DateRange, period: StatPeriod) {
    if (period !== StatPeriod.WEEK) return [];

    const from = new Date(range.from);
    const events = await this.prisma.userEvent.findMany({
      where: {
        userId,
        type: { in: [UserEventType.CLICK_WORD, UserEventType.ADD_TO_DICTIONARY] },
        createdAt: { gte: from },
      },
      select: { createdAt: true },
    });

    // countByDayHour["2025-05-20"][14] = N
    const countByDayHour: Record<string, Record<number, number>> = {};
    for (const e of events) {
      const day = this.utcDateKey(e.createdAt);
      const hour = e.createdAt.getUTCHours();
      if (!countByDayHour[day]) countByDayHour[day] = {};
      countByDayHour[day][hour] = (countByDayHour[day][hour] ?? 0) + 1;
    }

    const toLevel = (n: number): 0 | 1 | 2 | 3 | 4 => {
      if (n === 0) return 0;
      if (n <= 2) return 1;
      if (n <= 5) return 2;
      if (n <= 10) return 3;
      return 4;
    };

    // Use short English keys; the frontend maps these to localized labels
    const DAY_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - (6 - i));
      const dateStr = this.utcDateKey(d);
      const dow = (d.getUTCDay() + 6) % 7; // 0=Mon..6=Sun
      const hourMap = countByDayHour[dateStr] ?? {};

      return {
        date: dateStr,
        label: DAY_KEYS[dow],
        hours: Array.from({ length: 24 }, (__, h) => ({
          hour: h,
          count: hourMap[h] ?? 0,
          level: toLevel(hourMap[h] ?? 0),
        })),
      };
    });
  }

  // ─── Events chart ────────────────────────────────────────────────────────────
  // Per-day series: openText, addToDict, reviewSession for the selected period.

  private async getEventsChart(userId: string, range: DateRange, period: StatPeriod) {
    const daysBack = period === StatPeriod.WEEK ? 7 : period === StatPeriod.MONTH ? 30 : 365;
    const from = period === StatPeriod.ALL
      ? (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d; })()
      : range.from;

    const [openEvents, addEvents, reviewEvents] = await Promise.all([
      this.prisma.userEvent.findMany({
        where: { userId, type: UserEventType.OPEN_TEXT, createdAt: { gte: from } },
        select: { createdAt: true },
      }),
      this.prisma.userEvent.findMany({
        where: { userId, type: UserEventType.ADD_TO_DICTIONARY, createdAt: { gte: from } },
        select: { createdAt: true },
      }),
      this.prisma.userEvent.findMany({
        where: { userId, type: REVIEW_SESSION, createdAt: { gte: from } },
        select: { createdAt: true },
      }),
    ]);

    const count = Math.min(daysBack, 365);
    const labels: string[] = [];
    const indexByDate = new Map<string, number>();

    for (let i = 0; i < count; i++) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - (count - 1 - i));
      const key = this.utcDateKey(d);
      labels.push(key);
      indexByDate.set(key, i);
    }

    const openText = new Array<number>(count).fill(0);
    const addToDict = new Array<number>(count).fill(0);
    const reviewSession = new Array<number>(count).fill(0);

    const fill = (events: { createdAt: Date }[], target: number[]) => {
      for (const e of events) {
        const idx = indexByDate.get(this.utcDateKey(e.createdAt));
        if (idx !== undefined) target[idx] += 1;
      }
    };

    fill(openEvents, openText);
    fill(addEvents, addToDict);
    fill(reviewEvents, reviewSession);

    // Shorten labels: "2025-05-20" → "20.05" for week/month, "май" for year
    const shortLabels = labels.map((key) => {
      const d = new Date(key);
      if (period === StatPeriod.YEAR || period === StatPeriod.ALL) {
        return `${MONTH_LABELS[d.getUTCMonth()]}`;
      }
      return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    });

    // For year/all — collapse into monthly buckets
    if (period === StatPeriod.YEAR || period === StatPeriod.ALL) {
      const monthMap = new Map<string, { label: string; openText: number; addToDict: number; reviewSession: number }>();
      for (let i = 0; i < count; i++) {
        const d = new Date(labels[i]);
        const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
        const label = `${MONTH_LABELS[d.getUTCMonth()]}`;
        if (!monthMap.has(key)) monthMap.set(key, { label, openText: 0, addToDict: 0, reviewSession: 0 });
        const bucket = monthMap.get(key)!;
        bucket.openText += openText[i];
        bucket.addToDict += addToDict[i];
        bucket.reviewSession += reviewSession[i];
      }
      const buckets = Array.from(monthMap.values());
      return {
        labels: buckets.map((b) => b.label),
        series: {
          openText: buckets.map((b) => b.openText),
          addToDict: buckets.map((b) => b.addToDict),
          reviewSession: buckets.map((b) => b.reviewSession),
        },
      };
    }

    return { labels: shortLabels, series: { openText, addToDict, reviewSession } };
  }

  // ─── Vocabulary growth ───────────────────────────────────────────────────────
  // Cumulative word count by day + NEW/LEARNING/KNOWN split per day.

  private async getVocabularyGrowth(userId: string, range: DateRange, period: StatPeriod) {
    const daysBack = period === StatPeriod.WEEK ? 7 : period === StatPeriod.MONTH ? 30 : 365;
    const from = period === StatPeriod.ALL
      ? (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d; })()
      : range.from;

    // All words ever added (to compute running total before the window)
    const [allEntries, windowEntries] = await Promise.all([
      this.prisma.userDictionaryEntry.findMany({
        where: { userId, addedAt: { lt: from } },
        select: { addedAt: true },
      }),
      this.prisma.userDictionaryEntry.findMany({
        where: { userId, addedAt: { gte: from } },
        select: { addedAt: true, learningLevel: true },
        orderBy: { addedAt: 'asc' },
      }),
    ]);

    const baseCount = allEntries.length;

    const addedByDay: Record<string, number> = {};
    for (const e of windowEntries) {
      const day = this.utcDateKey(e.addedAt);
      addedByDay[day] = (addedByDay[day] ?? 0) + 1;
    }

    const count = Math.min(daysBack, 365);
    let running = baseCount;
    return Array.from({ length: count }, (_, i) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - (count - 1 - i));
      const day = this.utcDateKey(d);
      running += addedByDay[day] ?? 0;
      return { date: day, total: running, added: addedByDay[day] ?? 0 };
    });
  }

  // ─── Phrase progress ──────────────────────────────────────────────────────────

  private async getPhraseProgress(userId: string) {
    const [known, learning, newPhrases, total] = await Promise.all([
      this.prisma.userPhrasebookProgress.count({ where: { userId, status: PhraseStatus.KNOWN } }),
      this.prisma.userPhrasebookProgress.count({ where: { userId, status: PhraseStatus.LEARNING } }),
      this.prisma.userPhrasebookProgress.count({ where: { userId, status: PhraseStatus.NEW } }),
      this.prisma.phrasebookPhrase.count(),
    ]);
    return { total, known, learning, new: newPhrases };
  }

  // ─── Phrases per day ─────────────────────────────────────────────────────────

  private async getPhrasesPerDay(userId: string, range: DateRange, period: StatPeriod) {
    const daysBack = period === StatPeriod.WEEK ? 7 : period === StatPeriod.MONTH ? 30 : 365;
    const from = period === StatPeriod.ALL
      ? (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d; })()
      : range.from;

    const logs = await this.prisma.userPhrasebookReviewLog.findMany({
      where: { userId, createdAt: { gte: from } },
      select: { createdAt: true },
    });

    const countByDay: Record<string, number> = {};
    for (const l of logs) {
      const day = l.createdAt.toISOString().slice(0, 10);
      countByDay[day] = (countByDay[day] ?? 0) + 1;
    }

    const count = Math.min(daysBack, 365);
    return Array.from({ length: count }, (_, i) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - (count - 1 - i));
      const day = this.utcDateKey(d);
      return { date: day, count: countByDay[day] ?? 0 };
    });
  }

  // ─── Phrase review accuracy ───────────────────────────────────────────────────

  private async getPhraseAccuracy(userId: string, range: DateRange, period: StatPeriod) {
    const logs = await this.prisma.userPhrasebookReviewLog.findMany({
      where: { userId, ...this.periodWhere(period, range) },
      orderBy: { createdAt: "asc" },
      select: { correct: true },
    });

    const correct = logs.filter((l) => l.correct).length;
    const wrong = logs.length - correct;
    const percent = logs.length > 0 ? Math.round((correct / logs.length) * 100) : 0;

    let bestStreak = 0;
    let cur = 0;
    for (const log of logs) {
      if (log.correct) {
        cur++;
        if (cur > bestStreak) bestStreak = cur;
      } else {
        cur = 0;
      }
    }

    return { percent, correct, wrong, bestStreak, total: logs.length };
  }

  // ─── Write: reading time event ────────────────────────────────────────────────

  async logReadingSession(userId: string, textId: string, durationSeconds: number, wordsRead?: number) {
    await this.prisma.userEvent.create({
      data: { userId, type: READ_SESSION, metadata: { textId, durationSeconds, ...(wordsRead !== undefined && { wordsRead }) } },
    });
  }

  // ─── Write: review session event ──────────────────────────────────────────────

  async logReviewSession(userId: string, correct: number, wrong: number) {
    const total = correct + wrong;
    const streak = 0; // calculated client-side or left as 0
    await this.prisma.userEvent.create({
      data: { userId, type: REVIEW_SESSION, metadata: { correct, wrong, total, streak } },
    });
  }

  // ─── Achievements ────────────────────────────────────────────────────────────

  async getAchievements(userId: string) {
    const [wordCount, streak, textsCompleted, reviewLogs, firstEventAt, phraseLogs, readSessions] = await Promise.all([
      this.prisma.userDictionaryEntry.count({ where: { userId } }),
      this.analyticsService.getStreakDetails(userId),
      this.prisma.userTextProgress.count({ where: { userId, completedAt: { not: null } } }),
      this.prisma.userReviewLog.count({ where: { userId } }),
      this.prisma.userEvent.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.prisma.userPhrasebookReviewLog.count({ where: { userId } }),
      this.prisma.userEvent.count({ where: { userId, type: READ_SESSION } }),
    ]);

    const [knownWords, learningWords, totalReadingSeconds] = await Promise.all([
      this.prisma.userDictionaryEntry.count({ where: { userId, learningLevel: 'KNOWN' as any } }),
      this.prisma.userDictionaryEntry.count({ where: { userId, learningLevel: 'LEARNING' as any } }),
      this.prisma.$queryRaw<[{ seconds: string | null }]>`
        SELECT SUM((metadata->>'durationSeconds')::float) AS seconds
        FROM "user_event"
        WHERE "userId" = ${userId} AND type::text = 'READ_SESSION'
      `.then(r => Math.round((parseFloat(r[0]?.seconds ?? '0') || 0) / 60)),
    ]);

    const daysActive = firstEventAt
      ? Math.floor((Date.now() - firstEventAt.createdAt.getTime()) / 86400000) + 1
      : 0;

    // Perfect day: ≥10 reviews + ≥5 words added in one day
    const thirtyAgo = new Date(Date.now() - 30 * 86400000);
    const [dailyReviews, dailyWords] = await Promise.all([
      this.prisma.userReviewLog.groupBy({
        by: ['userId'],
        where: { userId, createdAt: { gte: thirtyAgo } },
        _count: { _all: true },
      }),
      this.prisma.userEvent.findMany({
        where: { userId, type: UserEventType.ADD_TO_DICTIONARY },
        select: { createdAt: true },
      }),
    ]);

    const wordsByDay: Record<string, number> = {};
    for (const e of dailyWords) {
      const d = this.utcDateKey(e.createdAt);
      wordsByDay[d] = (wordsByDay[d] ?? 0) + 1;
    }
    const bestWordDay = Math.max(0, ...Object.values(wordsByDay));

    // Best review day
    const reviewsByDay: Record<string, number> = {};
    for (const e of dailyWords) {
      const d = this.utcDateKey(e.createdAt);
      reviewsByDay[d] = (reviewsByDay[d] ?? 0) + 1;
    }

    // Accuracy metrics
    const totalReviewLogs = await this.prisma.userReviewLog.findMany({
      where: { userId },
      select: { correct: true },
      orderBy: { createdAt: 'asc' },
    });
    const correctCount = totalReviewLogs.filter(l => l.correct).length;
    const accuracyPct = totalReviewLogs.length > 0
      ? Math.round((correctCount / totalReviewLogs.length) * 100)
      : 0;

    let bestReviewStreak = 0, curReviewStreak = 0;
    for (const l of totalReviewLogs) {
      if (l.correct) { curReviewStreak++; if (curReviewStreak > bestReviewStreak) bestReviewStreak = curReviewStreak; }
      else curReviewStreak = 0;
    }

    const ACHIEVEMENTS = [
      // ── Vocabulary: adding words ──
      { id: 'first_word',    icon: '📖', reached: wordCount >= 1 },
      { id: 'words_5',       icon: '✏️', reached: wordCount >= 5 },
      { id: 'words_10',      icon: '🔤', reached: wordCount >= 10 },
      { id: 'words_25',      icon: '📝', reached: wordCount >= 25 },
      { id: 'words_50',      icon: '📚', reached: wordCount >= 50 },
      { id: 'words_75',      icon: '📒', reached: wordCount >= 75 },
      { id: 'words_100',     icon: '💯', reached: wordCount >= 100 },
      { id: 'words_150',     icon: '📘', reached: wordCount >= 150 },
      { id: 'words_200',     icon: '📓', reached: wordCount >= 200 },
      { id: 'words_250',     icon: '📗', reached: wordCount >= 250 },
      { id: 'words_350',     icon: '📙', reached: wordCount >= 350 },
      { id: 'words_500',     icon: '🏆', reached: wordCount >= 500 },
      { id: 'words_750',     icon: '🎖️', reached: wordCount >= 750 },
      { id: 'words_1000',    icon: '🌟', reached: wordCount >= 1000 },
      { id: 'words_1500',    icon: '💥', reached: wordCount >= 1500 },
      { id: 'words_2000',    icon: '👑', reached: wordCount >= 2000 },
      { id: 'words_3000',    icon: '🔱', reached: wordCount >= 3000 },
      { id: 'words_5000',    icon: '🌌', reached: wordCount >= 5000 },
      // ── Vocabulary: mastered ──
      { id: 'known_1',       icon: '🌱', reached: knownWords >= 1 },
      { id: 'known_5',       icon: '🌿', reached: knownWords >= 5 },
      { id: 'known_10',      icon: '✅', reached: knownWords >= 10 },
      { id: 'known_25',      icon: '🎗️', reached: knownWords >= 25 },
      { id: 'known_50',      icon: '🎯', reached: knownWords >= 50 },
      { id: 'known_100',     icon: '💎', reached: knownWords >= 100 },
      { id: 'known_250',     icon: '🦋', reached: knownWords >= 250 },
      { id: 'known_500',     icon: '🦾', reached: knownWords >= 500 },
      { id: 'known_1000',    icon: '🧠', reached: knownWords >= 1000 },
      // ── Vocabulary: speed ──
      { id: 'words_day_3',   icon: '🏃', reached: bestWordDay >= 3 },
      { id: 'words_day_5',   icon: '⚡', reached: bestWordDay >= 5 },
      { id: 'words_day_10',  icon: '🚄', reached: bestWordDay >= 10 },
      { id: 'words_day_15',  icon: '🚀', reached: bestWordDay >= 15 },
      { id: 'words_day_20',  icon: '🌊', reached: bestWordDay >= 20 },
      { id: 'words_day_50',  icon: '🌪️', reached: bestWordDay >= 50 },
      // ── Streak ──
      { id: 'streak_2',      icon: '✨', reached: streak.current >= 2 },
      { id: 'streak_3',      icon: '🔥', reached: streak.current >= 3 },
      { id: 'streak_5',      icon: '🌡️', reached: streak.current >= 5 },
      { id: 'streak_7',      icon: '🌶️', reached: streak.current >= 7 },
      { id: 'streak_10',     icon: '🎆', reached: streak.current >= 10 },
      { id: 'streak_14',     icon: '🌕', reached: streak.current >= 14 },
      { id: 'streak_21',     icon: '🌠', reached: streak.current >= 21 },
      { id: 'streak_30',     icon: '🚀', reached: streak.current >= 30 },
      { id: 'streak_45',     icon: '🌠', reached: streak.current >= 45 },
      { id: 'streak_60',     icon: '🌙', reached: streak.current >= 60 },
      { id: 'streak_90',     icon: '🌑', reached: streak.current >= 90 },
      { id: 'streak_100',    icon: '💫', reached: streak.current >= 100 },
      { id: 'streak_180',    icon: '🌍', reached: streak.current >= 180 },
      { id: 'streak_365',    icon: '🏅', reached: streak.current >= 365 },
      // ── Streak record ──
      { id: 'record_3',      icon: '📎', reached: streak.record >= 3 },
      { id: 'record_7',      icon: '📌', reached: streak.record >= 7 },
      { id: 'record_14',     icon: '🎀', reached: streak.record >= 14 },
      { id: 'record_30',     icon: '🎗️', reached: streak.record >= 30 },
      { id: 'record_60',     icon: '🥉', reached: streak.record >= 60 },
      { id: 'record_100',    icon: '🥈', reached: streak.record >= 100 },
      { id: 'record_365',    icon: '🥇', reached: streak.record >= 365 },
      // ── Texts ──
      { id: 'first_text',    icon: '📄', reached: textsCompleted >= 1 },
      { id: 'texts_2',       icon: '📃', reached: textsCompleted >= 2 },
      { id: 'texts_3',       icon: '📋', reached: textsCompleted >= 3 },
      { id: 'texts_5',       icon: '📰', reached: textsCompleted >= 5 },
      { id: 'texts_7',       icon: '📓', reached: textsCompleted >= 7 },
      { id: 'texts_10',      icon: '📑', reached: textsCompleted >= 10 },
      { id: 'texts_15',      icon: '📚', reached: textsCompleted >= 15 },
      { id: 'texts_20',      icon: '📜', reached: textsCompleted >= 20 },
      { id: 'texts_30',      icon: '🗒️', reached: textsCompleted >= 30 },
      { id: 'texts_50',      icon: '🗂️', reached: textsCompleted >= 50 },
      { id: 'texts_100',     icon: '📦', reached: textsCompleted >= 100 },
      // ── Reviews: volume ──
      { id: 'first_review',  icon: '🔁', reached: reviewLogs >= 1 },
      { id: 'reviews_5',     icon: '🔄', reached: reviewLogs >= 5 },
      { id: 'reviews_10',    icon: '🃏', reached: reviewLogs >= 10 },
      { id: 'reviews_25',    icon: '🎴', reached: reviewLogs >= 25 },
      { id: 'reviews_50',    icon: '🎓', reached: reviewLogs >= 50 },
      { id: 'reviews_100',   icon: '🏅', reached: reviewLogs >= 100 },
      { id: 'reviews_200',   icon: '🎖️', reached: reviewLogs >= 200 },
      { id: 'reviews_250',   icon: '🌟', reached: reviewLogs >= 250 },
      { id: 'reviews_500',   icon: '🥇', reached: reviewLogs >= 500 },
      { id: 'reviews_750',   icon: '💫', reached: reviewLogs >= 750 },
      { id: 'reviews_1000',  icon: '🌠', reached: reviewLogs >= 1000 },
      { id: 'reviews_2000',  icon: '🔥', reached: reviewLogs >= 2000 },
      { id: 'reviews_3000',  icon: '💥', reached: reviewLogs >= 3000 },
      { id: 'reviews_5000',  icon: '🔮', reached: reviewLogs >= 5000 },
      { id: 'reviews_10000', icon: '👁️', reached: reviewLogs >= 10000 },
      // ── Reviews: accuracy ──
      { id: 'acc_50',        icon: '🎯', reached: totalReviewLogs.length >= 10 && accuracyPct >= 50 },
      { id: 'acc_60',        icon: '🎪', reached: totalReviewLogs.length >= 20 && accuracyPct >= 60 },
      { id: 'acc_75',        icon: '💡', reached: totalReviewLogs.length >= 20 && accuracyPct >= 75 },
      { id: 'acc_85',        icon: '🌙', reached: totalReviewLogs.length >= 20 && accuracyPct >= 85 },
      { id: 'acc_90',        icon: '⭐', reached: totalReviewLogs.length >= 20 && accuracyPct >= 90 },
      { id: 'acc_95',        icon: '🌟', reached: totalReviewLogs.length >= 50 && accuracyPct >= 95 },
      { id: 'streak_review_5',   icon: '🎲', reached: bestReviewStreak >= 5 },
      { id: 'streak_review_10',  icon: '🎰', reached: bestReviewStreak >= 10 },
      { id: 'streak_review_25',  icon: '🎳', reached: bestReviewStreak >= 25 },
      { id: 'streak_review_50',  icon: '🎯', reached: bestReviewStreak >= 50 },
      { id: 'streak_review_100', icon: '🏆', reached: bestReviewStreak >= 100 },
      // ── Phrases ──
      { id: 'first_phrase',  icon: '💬', reached: phraseLogs >= 1 },
      { id: 'phrases_5',     icon: '🗯️', reached: phraseLogs >= 5 },
      { id: 'phrases_10',    icon: '🗨️', reached: phraseLogs >= 10 },
      { id: 'phrases_25',    icon: '💭', reached: phraseLogs >= 25 },
      { id: 'phrases_50',    icon: '🗣️', reached: phraseLogs >= 50 },
      { id: 'phrases_100',   icon: '📢', reached: phraseLogs >= 100 },
      { id: 'phrases_200',   icon: '💡', reached: phraseLogs >= 200 },
      { id: 'phrases_500',   icon: '🌐', reached: phraseLogs >= 500 },
      // ── Reading time ──
      { id: 'read_5min',     icon: '📰', reached: totalReadingSeconds >= 5 },
      { id: 'read_10min',    icon: '☕', reached: totalReadingSeconds >= 10 },
      { id: 'read_30min',    icon: '📖', reached: totalReadingSeconds >= 30 },
      { id: 'read_60min',    icon: '⏱️', reached: totalReadingSeconds >= 60 },
      { id: 'read_2h',       icon: '🕐', reached: totalReadingSeconds >= 120 },
      { id: 'read_5h',       icon: '📡', reached: totalReadingSeconds >= 300 },
      { id: 'read_10h',      icon: '📻', reached: totalReadingSeconds >= 600 },
      { id: 'read_20h',      icon: '🌅', reached: totalReadingSeconds >= 1200 },
      { id: 'read_50h',      icon: '🌄', reached: totalReadingSeconds >= 3000 },
      { id: 'read_sessions_3',  icon: '📔', reached: readSessions >= 3 },
      { id: 'read_sessions_5',  icon: '🕮', reached: readSessions >= 5 },
      { id: 'read_sessions_10', icon: '📕', reached: readSessions >= 10 },
      { id: 'read_sessions_25', icon: '📗', reached: readSessions >= 25 },
      { id: 'read_sessions_50', icon: '📙', reached: readSessions >= 50 },
      { id: 'read_sessions_100',icon: '📘', reached: readSessions >= 100 },
      // ── Account age ──
      { id: 'days_1',        icon: '🌤️', reached: daysActive >= 1 },
      { id: 'days_3',        icon: '🌥️', reached: daysActive >= 3 },
      { id: 'days_7',        icon: '📅', reached: daysActive >= 7 },
      { id: 'days_14',       icon: '🗓️', reached: daysActive >= 14 },
      { id: 'days_30',       icon: '🌿', reached: daysActive >= 30 },
      { id: 'days_60',       icon: '🌲', reached: daysActive >= 60 },
      { id: 'days_90',       icon: '🌳', reached: daysActive >= 90 },
      { id: 'days_180',      icon: '🏔️', reached: daysActive >= 180 },
      { id: 'days_365',      icon: '🎂', reached: daysActive >= 365 },
      { id: 'days_730',      icon: '🎊', reached: daysActive >= 730 },
      // ── Learning level ──
      { id: 'learning_words_5',   icon: '🔬', reached: learningWords >= 5 },
      { id: 'learning_words_10',  icon: '🔭', reached: learningWords >= 10 },
      { id: 'learning_words_25',  icon: '🧫', reached: learningWords >= 25 },
      { id: 'learning_words_50',  icon: '🧪', reached: learningWords >= 50 },
      { id: 'learning_words_100', icon: '⚗️', reached: learningWords >= 100 },
      { id: 'learning_words_200', icon: '🧬', reached: learningWords >= 200 },
      // ── Vocabulary: legendary milestones ──
      { id: 'words_4000',   icon: '🗺️', reached: wordCount >= 4000 },
      { id: 'words_7500',   icon: '🌐', reached: wordCount >= 7500 },
      { id: 'words_10000',  icon: '🏛️', reached: wordCount >= 10000 },
      // ── Mastered: legendary ──
      { id: 'known_2000',   icon: '🎓', reached: knownWords >= 2000 },
      { id: 'known_5000',   icon: '🔑', reached: knownWords >= 5000 },
      // ── Texts: legendary ──
      { id: 'texts_200',    icon: '🗃️', reached: textsCompleted >= 200 },
      { id: 'texts_500',    icon: '📚', reached: textsCompleted >= 500 },
      // ── Reviews: legendary ──
      { id: 'reviews_25000',  icon: '♾️',  reached: reviewLogs >= 25000 },
      { id: 'reviews_50000',  icon: '🌌', reached: reviewLogs >= 50000 },
      // ── Streak: legendary ──
      { id: 'streak_500',   icon: '🌋', reached: streak.current >= 500 },
      { id: 'streak_730',   icon: '🪐', reached: streak.current >= 730 },
      // ── Account: legendary ──
      { id: 'days_1095',    icon: '🏆', reached: daysActive >= 1095 },
      // ── Reading time: legendary ──
      { id: 'read_100h',    icon: '📡', reached: totalReadingSeconds >= 6000 },
      { id: 'read_200h',    icon: '🌠', reached: totalReadingSeconds >= 12000 },
      { id: 'read_sessions_200', icon: '📰', reached: readSessions >= 200 },
      { id: 'read_sessions_500', icon: '📖', reached: readSessions >= 500 },
      // ── Phrases: legendary ──
      { id: 'phrases_1000', icon: '🗺️', reached: phraseLogs >= 1000 },
      { id: 'phrases_2000', icon: '🌏', reached: phraseLogs >= 2000 },
      // ── Accuracy: legendary ──
      { id: 'acc_99',             icon: '💠', reached: totalReviewLogs.length >= 100 && accuracyPct >= 99 },
      { id: 'streak_review_200',  icon: '🌊', reached: bestReviewStreak >= 200 },
      { id: 'streak_review_500',  icon: '⚡', reached: bestReviewStreak >= 500 },
      // ── Speed: legendary ──
      { id: 'words_day_100', icon: '🌪️', reached: bestWordDay >= 100 },
      // ── Record: legendary ──
      { id: 'record_180',  icon: '🎪', reached: streak.record >= 180 },
      { id: 'record_730',  icon: '🎠', reached: streak.record >= 730 },
      // ── Vocabulary pace (7-day rolling) ──
      // ── Diversity: different text levels read ──
      // ── Consistency: reviewed X days in a row ──
      // ── Depth: high total review count per word ──
      // ── Dedication: many sessions total ──
      // ── Growth: from NEW to KNOWN journey ──
      { id: 'journey_10pct_known',  icon: '🌄', reached: wordCount >= 50 && knownWords >= Math.floor(wordCount * 0.1) },
      { id: 'journey_25pct_known',  icon: '☀️', reached: wordCount >= 100 && knownWords >= Math.floor(wordCount * 0.25) },
      { id: 'journey_50pct_known',  icon: '🌟', reached: wordCount >= 50 && knownWords >= Math.floor(wordCount * 0.5) },
      { id: 'journey_75pct_known',  icon: '💫', reached: wordCount >= 50 && knownWords >= Math.floor(wordCount * 0.75) },
      // ── Persistence: total vocab milestones with reviews ──
      { id: 'persist_100w_100r',  icon: '🪴', reached: wordCount >= 100 && reviewLogs >= 100 },
      { id: 'persist_500w_500r',  icon: '🌴', reached: wordCount >= 500 && reviewLogs >= 500 },
      { id: 'persist_1000w_1000r',icon: '🌵', reached: wordCount >= 1000 && reviewLogs >= 1000 },
      // ── Combo: vocabulary + reading same day ──
      { id: 'combo_scholar',   icon: '🎨', reached: readSessions >= 10 && wordCount >= 100 },
      { id: 'combo_master',    icon: '🎬', reached: readSessions >= 50 && wordCount >= 500 },
      // ── Complete learner: all three pillars active ──
      { id: 'complete_starter',  icon: '🌐', reached: wordCount >= 10 && reviewLogs >= 10 && phraseLogs >= 1 },
      { id: 'complete_learner',  icon: '🗺️', reached: wordCount >= 100 && reviewLogs >= 100 && phraseLogs >= 10 },
      { id: 'complete_master',   icon: '🏆', reached: wordCount >= 500 && reviewLogs >= 500 && phraseLogs >= 50 },
      { id: 'complete_expert',   icon: '👑', reached: wordCount >= 1000 && reviewLogs >= 1000 && phraseLogs >= 100 },
      // ── Long read: single session reading ──
      // ── Phrase mastery combos ──
      { id: 'phrase_reader',    icon: '💬', reached: phraseLogs >= 10 && readSessions >= 5 },
      { id: 'phrase_scholar',   icon: '🗣️', reached: phraseLogs >= 100 && readSessions >= 20 },
      // ── Milestones: special round numbers ──
      { id: 'milestone_50w_50r',   icon: '🎯', reached: wordCount >= 50 && reviewLogs >= 50 },
      { id: 'milestone_200w_200r', icon: '🏅', reached: wordCount >= 200 && reviewLogs >= 200 },
      { id: 'words_day_30',  icon: '🌠', reached: bestWordDay >= 30 },
      { id: 'words_day_75',  icon: '🌌', reached: bestWordDay >= 75 },
      { id: 'reviews_7500',  icon: '🔮', reached: reviewLogs >= 7500 },
      { id: 'reviews_15000', icon: '🌊', reached: reviewLogs >= 15000 },
    ];

    return {
      list: ACHIEVEMENTS,
      reached: ACHIEVEMENTS.filter(a => a.reached).length,
      total: ACHIEVEMENTS.length,
    };
  }

  // ─── Goal forecast ────────────────────────────────────────────────────────────

  async getGoalForecast(userId: string) {
    const [goals, wordCount, recentAdded] = await Promise.all([
      this.prisma.userGoals.findUnique({ where: { userId }, select: { vocabularyGoal: true } }),
      this.prisma.userDictionaryEntry.count({ where: { userId } }),
      this.prisma.userEvent.count({
        where: {
          userId,
          type: UserEventType.ADD_TO_DICTIONARY,
          createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
        },
      }),
    ]);

    const goal = goals?.vocabularyGoal ?? 800;
    const remaining = Math.max(0, goal - wordCount);
    const avgPerDay = recentAdded / 30;
    const daysToGoal = avgPerDay > 0 ? Math.ceil(remaining / avgPerDay) : null;
    const pct = Math.min(100, Math.round((wordCount / goal) * 100));

    return { goal, current: wordCount, remaining, avgPerDay: Math.round(avgPerDay * 10) / 10, daysToGoal, pct };
  }

  // ─── Review sessions ─────────────────────────────────────────────────────────

  async getReviewSessions(userId: string, range: DateRange, period: StatPeriod) {
    const [sessions, logs] = await Promise.all([
      this.prisma.userEvent.findMany({
        where: { userId, type: REVIEW_SESSION, ...this.periodWhere(period, range) },
        select: { createdAt: true, metadata: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.userReviewLog.findMany({
        where: { userId, ...this.periodWhere(period, range) },
        select: { createdAt: true, correct: true },
      }),
    ]);

    const totalSessions = sessions.length;
    const totalCards = logs.length;
    const avgCardsPerSession = totalSessions > 0 ? Math.round(totalCards / totalSessions) : 0;

    // Best day
    const cardsByDay: Record<string, number> = {};
    for (const l of logs) {
      const day = this.utcDateKey(l.createdAt);
      cardsByDay[day] = (cardsByDay[day] ?? 0) + 1;
    }
    const bestDayCount = Math.max(0, ...Object.values(cardsByDay));

    // Avg session duration from metadata
    let totalDuration = 0;
    let durCount = 0;
    for (const s of sessions) {
      const meta = s.metadata as Record<string, unknown> | null;
      const dur = meta?.durationSeconds as number | undefined;
      if (dur && dur > 0) { totalDuration += dur; durCount++; }
    }
    const avgDurationSeconds = durCount > 0 ? Math.round(totalDuration / durCount) : null;

    // Mastered words (learningLevel = KNOWN)
    const masteredWords = await this.prisma.userDictionaryEntry.count({
      where: { userId, learningLevel: 'KNOWN' as any },
    });

    return { totalSessions, totalCards, avgCardsPerSession, bestDayCount, avgDurationSeconds, masteredWords };
  }

  // ─── Retention / learning levels ─────────────────────────────────────────────

  async getRetention(userId: string) {
    const [byLevel, dueForReview] = await Promise.all([
      this.prisma.userDictionaryEntry.groupBy({
        by: ['learningLevel'],
        where: { userId },
        _count: { _all: true },
      }),
      // Due = not seen in last 7 days but not KNOWN
      this.prisma.userDictionaryEntry.count({
        where: {
          userId,
          learningLevel: { not: 'KNOWN' as any },
          updatedAt: { lt: new Date(Date.now() - 7 * 86400000) },
        },
      }),
    ]);

    const levelMap: Record<string, number> = {};
    for (const r of byLevel) levelMap[r.learningLevel] = r._count._all;

    return {
      levels: [
        { level: 'NEW', count: levelMap['NEW'] ?? 0 },
        { level: 'LEARNING', count: levelMap['LEARNING'] ?? 0 },
        { level: 'KNOWN', count: levelMap['KNOWN'] ?? 0 },
      ],
      dueForReview,
      total: Object.values(levelMap).reduce((a, b) => a + b, 0),
    };
  }

  // ─── Top words ────────────────────────────────────────────────────────────────

  async getTopWords(userId: string, range: DateRange, period: StatPeriod) {
    // Hardest: most wrong answers in period
    const wrongLogs = await this.prisma.userReviewLog.findMany({
      where: { userId, correct: false, ...this.periodWhere(period, range) },
      select: { lemmaId: true },
    });

    const wrongCount: Record<string, number> = {};
    for (const l of wrongLogs) wrongCount[l.lemmaId] = (wrongCount[l.lemmaId] ?? 0) + 1;

    const topHardestIds = Object.entries(wrongCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id]) => id);

    const hardestEntries = topHardestIds.length > 0
      ? await this.prisma.userDictionaryEntry.findMany({
          where: { userId, lemmaId: { in: topHardestIds } },
          select: { word: true, translation: true, learningLevel: true, lemmaId: true },
        })
      : [];

    const hardest = topHardestIds
      .map(lemmaId => {
        const entry = hardestEntries.find(e => e.lemmaId === lemmaId);
        return entry ? { word: entry.word, translation: entry.translation, level: entry.learningLevel, wrongCount: wrongCount[lemmaId] } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    // Best progress: recently added words that are now KNOWN
    const recentlyMastered = await this.prisma.userDictionaryEntry.findMany({
      where: { userId, learningLevel: 'KNOWN' as any, updatedAt: { gte: range.from } },
      orderBy: { updatedAt: 'desc' },
      take: 8,
      select: { word: true, translation: true, addedAt: true },
    });

    return { hardest, recentlyMastered };
  }

  // ─── Activity by weekday ─────────────────────────────────────────────────────

  async getWeekdayActivity(userId: string, range: DateRange, period: StatPeriod) {
    const from = period === StatPeriod.ALL
      ? (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d; })()
      : range.from;

    const events = await this.prisma.userEvent.findMany({
      where: {
        userId,
        type: { in: [UserEventType.CLICK_WORD, UserEventType.ADD_TO_DICTIONARY] },
        createdAt: { gte: from },
      },
      select: { createdAt: true },
    });

    // 0=Sun..6=Sat → remap to Mon=0..Sun=6
    const countByDow = new Array(7).fill(0);
    const dayCount = new Array(7).fill(0); // how many distinct calendar days per dow (for averaging)

    const seenDays = new Set<string>();
    for (const e of events) {
      const dow = (e.createdAt.getUTCDay() + 6) % 7;
      countByDow[dow] += 1;
      const dayKey = `${dow}-${this.utcDateKey(e.createdAt)}`;
      if (!seenDays.has(dayKey)) { seenDays.add(dayKey); dayCount[dow] += 1; }
    }

    const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    return DAY_LABELS.map((label, i) => ({
      label,
      total: countByDow[i],
      avg: dayCount[i] > 0 ? Math.round(countByDow[i] / dayCount[i]) : 0,
    }));
  }

  // ─── Reading speed ────────────────────────────────────────────────────────────

  async getReadingSpeed(userId: string, range: DateRange, period: StatPeriod) {
    const sessions = await this.prisma.userEvent.findMany({
      where: { userId, type: READ_SESSION, ...this.periodWhere(period, range) },
      select: { createdAt: true, metadata: true },
      orderBy: { createdAt: 'asc' },
    });

    const points: { date: string; wpm: number }[] = [];
    for (const s of sessions) {
      const meta = s.metadata as Record<string, unknown> | null;
      const dur = meta?.durationSeconds as number | undefined;
      const words = meta?.wordsRead as number | undefined;
      if (dur && dur > 10 && words && words > 0) {
        const wpm = Math.round((words / dur) * 60);
        if (wpm > 0 && wpm < 1000) {
          points.push({ date: this.utcDateKey(s.createdAt), wpm });
        }
      }
    }

    if (points.length === 0) return { avg: 0, best: 0, points: [] };

    // Aggregate by day (avg wpm per day)
    const dayMap = new Map<string, number[]>();
    for (const p of points) {
      if (!dayMap.has(p.date)) dayMap.set(p.date, []);
      dayMap.get(p.date)!.push(p.wpm);
    }
    const dailyPoints = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, wpms]) => ({ date, wpm: Math.round(wpms.reduce((a, b) => a + b, 0) / wpms.length) }));

    const avg = Math.round(dailyPoints.reduce((a, p) => a + p.wpm, 0) / dailyPoints.length);
    const best = Math.max(...dailyPoints.map(p => p.wpm));

    return { avg, best, points: dailyPoints };
  }

  // ─── Weak spots ───────────────────────────────────────────────────────────────

  async getWeakSpots(userId: string) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

    // Abandoned texts: 10–80% progress, not opened in last 14 days
    const abandonedTexts = await this.prisma.userTextProgress.findMany({
      where: {
        userId,
        progressPercent: { gte: 10, lt: 100 },
        lastOpened: { lt: new Date(Date.now() - 14 * 86400000) },
      },
      orderBy: { lastOpened: 'desc' },
      take: 5,
      include: { text: { select: { id: true, title: true, level: true, imageUrl: true } } },
    });

    // Struggling words: LEARNING status, updated more than 7 days ago (not reviewed)
    const strugglingWords = await this.prisma.userDictionaryEntry.findMany({
      where: { userId, learningLevel: 'LEARNING' as any, updatedAt: { lt: sevenDaysAgo } },
      orderBy: { updatedAt: 'asc' },
      take: 8,
      select: { word: true, translation: true, updatedAt: true, learningLevel: true },
    });

    // Low accuracy words: lemmas with >3 wrong reviews in last 30 days
    const recentWrong = await this.prisma.userReviewLog.findMany({
      where: { userId, correct: false, createdAt: { gte: thirtyDaysAgo } },
      select: { lemmaId: true },
    });
    const wrongMap: Record<string, number> = {};
    for (const l of recentWrong) wrongMap[l.lemmaId] = (wrongMap[l.lemmaId] ?? 0) + 1;
    const lowAccuracyLemmaIds = Object.entries(wrongMap)
      .filter(([, n]) => n >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id]) => id);

    const lowAccuracyEntries = lowAccuracyLemmaIds.length > 0
      ? await this.prisma.userDictionaryEntry.findMany({
          where: { userId, lemmaId: { in: lowAccuracyLemmaIds } },
          select: { word: true, translation: true, lemmaId: true },
        })
      : [];

    const lowAccuracy = lowAccuracyLemmaIds.map(lemmaId => {
      const e = lowAccuracyEntries.find(x => x.lemmaId === lemmaId);
      return e ? { word: e.word, translation: e.translation, wrongCount: wrongMap[lemmaId] } : null;
    }).filter((x): x is NonNullable<typeof x> => x !== null);

    return {
      abandonedTexts: abandonedTexts.map(r => ({
        id: r.text.id,
        title: r.text.title,
        level: r.text.level,
        imageUrl: r.text.imageUrl,
        progressPercent: Math.round(r.progressPercent),
        lastOpened: r.lastOpened?.toISOString() ?? null,
      })),
      strugglingWords,
      lowAccuracy,
    };
  }

  // ─── Sparkline data for KPI ───────────────────────────────────────────────────

  async getKpiSparklines(userId: string) {
    const days = 14;
    const from = new Date(Date.now() - days * 86400000);

    const [addEvents, reviewLogs, readEvents, textCompletions] = await Promise.all([
      this.prisma.userEvent.findMany({
        where: { userId, type: UserEventType.ADD_TO_DICTIONARY, createdAt: { gte: from } },
        select: { createdAt: true },
      }),
      this.prisma.userReviewLog.findMany({
        where: { userId, createdAt: { gte: from } },
        select: { createdAt: true },
      }),
      this.prisma.userEvent.findMany({
        where: { userId, type: READ_SESSION, createdAt: { gte: from } },
        select: { createdAt: true, metadata: true },
      }),
      this.prisma.userTextProgress.findMany({
        where: { userId, completedAt: { gte: from } },
        select: { completedAt: true },
      }),
    ]);

    const makeSparkline = (events: { createdAt: Date }[]): number[] => {
      const byDay: Record<string, number> = {};
      for (const e of events) { const d = this.utcDateKey(e.createdAt); byDay[d] = (byDay[d] ?? 0) + 1; }
      return Array.from({ length: days }, (_, i) => {
        const d = new Date(from); d.setUTCDate(d.getUTCDate() + i);
        return byDay[this.utcDateKey(d)] ?? 0;
      });
    };

    const readMinByDay: Record<string, number> = {};
    for (const e of readEvents) {
      const d = this.utcDateKey(e.createdAt);
      const meta = e.metadata as Record<string, unknown> | null;
      const sec = (meta?.durationSeconds as number | undefined) ?? 0;
      readMinByDay[d] = (readMinByDay[d] ?? 0) + Math.round(sec / 60);
    }
    const readSparkline = Array.from({ length: days }, (_, i) => {
      const d = new Date(from); d.setUTCDate(d.getUTCDate() + i);
      return readMinByDay[this.utcDateKey(d)] ?? 0;
    });

    const textsByDay: Record<string, number> = {};
    for (const t of textCompletions) {
      if (t.completedAt) { const d = this.utcDateKey(t.completedAt); textsByDay[d] = (textsByDay[d] ?? 0) + 1; }
    }
    const textsSparkline = Array.from({ length: days }, (_, i) => {
      const d = new Date(from); d.setUTCDate(d.getUTCDate() + i);
      return textsByDay[this.utcDateKey(d)] ?? 0;
    });

    return {
      wordsLearned: makeSparkline(addEvents),
      reviews: makeSparkline(reviewLogs),
      readingTime: readSparkline,
      textsRead: textsSparkline,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private wordForm(n: number): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "слово";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "слова";
    return "слов";
  }
}
