import { Injectable } from "@nestjs/common";
import { UserEventType } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { StatPeriod } from "./dto/statistics-query.dto";

interface DateRange {
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
}

const MONTH_LABELS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
const WEEK_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const STREAK_MILESTONES = [3, 7, 14, 30];
const READ_SESSION = "READ_SESSION" as UserEventType;
const REVIEW_SESSION = "REVIEW_SESSION" as UserEventType;

@Injectable()
export class StatisticsService {
  constructor(private readonly prisma: PrismaService) {}

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
      this.getWordStats(userId),
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
    const events = await this.prisma.userEvent.findMany({
      where: { userId, type: READ_SESSION, ...this.periodWhere(period, range) },
      select: { metadata: true },
    });

    const totalSeconds = events.reduce((sum, e) => {
      const meta = e.metadata as { durationSeconds?: number } | null;
      return sum + (meta?.durationSeconds ?? 0);
    }, 0);
    const total = Math.round(totalSeconds / 60);

    let delta: number | null = null;
    if (period !== StatPeriod.ALL) {
      const prevEvents = await this.prisma.userEvent.findMany({
        where: { userId, type: READ_SESSION, createdAt: { gte: range.prevFrom, lt: range.prevTo } },
        select: { metadata: true },
      });
      const prevSeconds = prevEvents.reduce((sum, e) => {
        const meta = e.metadata as { durationSeconds?: number } | null;
        return sum + (meta?.durationSeconds ?? 0);
      }, 0);
      delta = total - Math.round(prevSeconds / 60);
    }

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

  private async getStreak(userId: string) {
    const events = await this.prisma.userEvent.findMany({
      where: { userId },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    const uniqueDays = [...new Set(events.map((e) => this.utcDateKey(e.createdAt)))].sort().reverse();

    const today = this.utcDateKey(new Date());
    const yesterday = this.utcDateKey(new Date(Date.now() - 86_400_000));

    // Current streak
    let current = 0;
    if (uniqueDays.length && (uniqueDays[0] === today || uniqueDays[0] === yesterday)) {
      let expected = uniqueDays[0];
      for (const day of uniqueDays) {
        if (day === expected) {
          current++;
          const d = new Date(expected);
          d.setDate(d.getDate() - 1);
          expected = this.utcDateKey(d);
        } else break;
      }
    }

    // All-time record
    let record = 0;
    let runLen = 0;
    const asc = [...uniqueDays].sort();
    for (let i = 0; i < asc.length; i++) {
      if (i === 0) {
        runLen = 1;
      } else {
        const prev = new Date(asc[i - 1]);
        prev.setDate(prev.getDate() + 1);
        runLen = this.utcDateKey(prev) === asc[i] ? runLen + 1 : 1;
      }
      if (runLen > record) record = runLen;
    }

    // Current week (Mon–Sun)
    const now = new Date();
    const dow = now.getUTCDay();
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
    monday.setUTCHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    sunday.setUTCHours(23, 59, 59, 999);

    const weekEvents = await this.prisma.userEvent.findMany({
      where: { userId, createdAt: { gte: monday, lte: sunday } },
      select: { createdAt: true },
    });
    const activeDays = new Set(weekEvents.map((e) => this.utcDateKey(e.createdAt)));
    const todayStr = this.utcDateKey(now);

    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setUTCDate(monday.getUTCDate() + i);
      const dateStr = this.utcDateKey(d);
      return { date: dateStr, label: WEEK_LABELS[i], active: activeDays.has(dateStr), isToday: dateStr === todayStr };
    });

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

  // ─── Word stats ──────────────────────────────────────────────────────────────

  private async getWordStats(userId: string) {
    const grouped = await this.prisma.userWordProgress.groupBy({
      by: ["status"],
      where: { userId },
      _count: { status: true },
    });

    const map = Object.fromEntries(grouped.map((g) => [g.status, g._count.status]));
    const total = grouped.reduce((sum, g) => sum + g._count.status, 0);

    return {
      total,
      known: map["KNOWN"] ?? 0,
      learning: map["LEARNING"] ?? 0,
      new: map["NEW"] ?? 0,
    };
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
    const versions = await this.prisma.textProcessingVersion.findMany({
      where: { textId: { in: textIds } },
      orderBy: { version: "desc" },
      select: { id: true, textId: true },
    });

    const latestVersionByTextId = new Map<string, string>();
    for (const v of versions) {
      if (!latestVersionByTextId.has(v.textId)) latestVersionByTextId.set(v.textId, v.id);
    }

    const versionIds = [...latestVersionByTextId.values()];
    const tokenCounts = await this.prisma.textToken.groupBy({
      by: ["versionId"],
      where: { versionId: { in: versionIds } },
      _count: { id: true },
    });
    const countByVersionId = new Map(tokenCounts.map((c) => [c.versionId, c._count.id]));

    return progressRows.map((r) => {
      const versionId = latestVersionByTextId.get(r.textId);
      const wordCount = versionId ? (countByVersionId.get(versionId) ?? 0) : 0;
      const progressPercent = Math.round(r.progressPercent);
      const knownWords = Math.round((r.progressPercent / 100) * wordCount);

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
