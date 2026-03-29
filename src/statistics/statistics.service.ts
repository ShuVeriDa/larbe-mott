import { Injectable } from "@nestjs/common";
import { Prisma, UserEventType } from "@prisma/client";
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

  async getUserStatistics(userId: string, period: StatPeriod) {
    const range = this.buildRange(period);

    const [
      wordsLearned,
      readingTimeMinutes,
      reviews,
      textsRead,
      streak,
      heatmap,
      words,
      wordsPerDay,
      texts,
      accuracy,
      recentActivity,
    ] = await Promise.all([
      this.getWordsLearned(userId, range, period),
      this.getReadingTime(userId, range, period),
      this.getReviews(userId, range, period),
      this.getTextsRead(userId, range, period),
      this.getStreak(userId),
      this.getYearHeatmap(userId),
      this.analyticsService.getWordStats(userId),
      this.getWordsPerDay(userId, range, period),
      this.getTextsProgress(userId),
      this.getAccuracy(userId, range, period),
      this.getRecentActivity(userId, range),
    ]);

    return {
      period,
      header: { wordsLearned, readingTimeMinutes, reviews, textsRead },
      streak,
      heatmap,
      words,
      wordsPerDay,
      texts,
      accuracy,
      recentActivity,
    };
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
        FROM "UserEvent"
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

  private async getTextsRead(userId: string, range: DateRange, period: StatPeriod) {
    const events = await this.prisma.userEvent.findMany({
      where: { userId, type: UserEventType.OPEN_TEXT, ...this.periodWhere(period, range) },
      select: { metadata: true },
    });

    const textIds = new Set(
      events
        .map((e) => (e.metadata as { textId?: string } | null)?.textId)
        .filter((id): id is string => Boolean(id)),
    );

    let delta: number | null = null;
    if (period !== StatPeriod.ALL) {
      const prevEvents = await this.prisma.userEvent.findMany({
        where: { userId, type: UserEventType.OPEN_TEXT, createdAt: { gte: range.prevFrom, lt: range.prevTo } },
        select: { metadata: true },
      });
      const prevIds = new Set(
        prevEvents
          .map((e) => (e.metadata as { textId?: string } | null)?.textId)
          .filter((id): id is string => Boolean(id)),
      );
      delta = textIds.size - prevIds.size;
    }

    return { total: textIds.size, delta };
  }

  // ─── Streak ──────────────────────────────────────────────────────────────────
  // Делегируем в AnalyticsService, добавляем только milestones

  private async getStreak(userId: string) {
    const { current, record, weekDays } = await this.analyticsService.getStreakDetails(userId);
    const milestones = STREAK_MILESTONES.map((days) => ({ days, reached: current >= days }));
    return { current, record, weekDays, milestones };
  }

  // ─── Year heatmap ────────────────────────────────────────────────────────────

  private async getYearHeatmap(userId: string) {
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

    const toLevel = (n: number): 0 | 1 | 2 | 3 | 4 => {
      if (n === 0) return 0;
      if (n <= 5) return 1;
      if (n <= 15) return 2;
      if (n <= 30) return 3;
      return 4;
    };

    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      const days = Array.from({ length: daysInMonth }, (_, d) => {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`;
        return { date: dateStr, level: toLevel(countByDay[dateStr] ?? 0) };
      });

      return { month: MONTH_LABELS[month], days };
    });
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
        FROM "Text" t
        LEFT JOIN LATERAL (
          SELECT tpv.id
          FROM "TextProcessingVersion" tpv
          WHERE tpv."textId" = t.id
          ORDER BY tpv.version DESC
          LIMIT 1
        ) lv ON true
        LEFT JOIN "TextToken" tt ON tt."versionId" = lv.id
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

  private async getRecentActivity(userId: string, range: DateRange) {
    const events = await this.prisma.userEvent.findMany({
      where: {
        userId,
        type: { in: [UserEventType.OPEN_TEXT, UserEventType.ADD_TO_DICTIONARY, REVIEW_SESSION] },
        createdAt: { gte: range.from },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
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

        const title = textId ? (titleByTextId.get(textId) ?? "Текст") : "Текст";
        const pageNumber = meta?.pageNumber as number | undefined;
        result.push({
          type: "READ_TEXT",
          title: `Читал «${title}»`,
          description: pageNumber ? `стр. ${pageNumber}` : "",
          date: e.createdAt.toISOString(),
          icon: "text",
        });
      } else if (e.type === UserEventType.ADD_TO_DICTIONARY) {
        const day = this.utcDateKey(e.createdAt);
        if (seenAddDay.has(day)) continue;
        seenAddDay.add(day);

        const count = addByDay.get(day) ?? 1;
        result.push({
          type: "ADD_WORDS",
          title: `Добавлено ${count} ${this.wordForm(count)} в словарь`,
          description: "",
          date: e.createdAt.toISOString(),
          icon: "word",
        });
      } else if (e.type === REVIEW_SESSION) {
        const correct = meta?.correct as number | undefined ?? 0;
        const wrong = meta?.wrong as number | undefined ?? 0;
        const total = correct + wrong;
        const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
        result.push({
          type: "REVIEW",
          title: "Сессия повторения",
          description: total > 0 ? `${total} карточек · ${accuracy}% правильно` : "",
          date: e.createdAt.toISOString(),
          icon: "review",
        });
      }

      if (result.length >= 15) break;
    }

    return result;
  }

  // ─── Write: reading time event ────────────────────────────────────────────────

  async logReadingSession(userId: string, textId: string, durationSeconds: number) {
    await this.prisma.userEvent.create({
      data: { userId, type: READ_SESSION, metadata: { textId, durationSeconds } },
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

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private wordForm(n: number): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "слово";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "слова";
    return "слов";
  }
}
