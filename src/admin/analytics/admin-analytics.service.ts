import { Injectable } from "@nestjs/common";
import { Level, Prisma, UserEventType } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import {
  AnalyticsExportFormat,
  AnalyticsRange,
  DifficultTextsTab,
  FetchAdminAnalyticsDto,
  PopularTextsTab,
} from "./dto/fetch-admin-analytics.dto";

interface PeriodBounds {
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  tz: string;
}

interface ComplexTextsLegacyOptions {
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

interface PopularLevelsLegacyOptions {
  dateFrom?: string;
  dateTo?: string;
}

interface TrendInfo {
  type: "up" | "down" | "neutral";
  value: number;
  unit: "percent" | "pp";
}

interface LevelDistributionItem {
  level: Level;
  levelLabel: string;
  usersCount: number;
  percent: number;
}

const LEVEL_ORDER: Level[] = [
  Level.A1,
  Level.A2,
  Level.B1,
  Level.B2,
  Level.C1,
  Level.C2,
];

const LEVEL_LABELS: Record<Level, string> = {
  [Level.A1]: "Начинающий",
  [Level.A2]: "Элементарный",
  [Level.B1]: "Средний",
  [Level.B2]: "Выше среднего",
  [Level.C1]: "Продвинутый",
  [Level.C2]: "Свободный",
};

const HEATMAP_DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const INTERESTING_EVENT_TYPES = [
  UserEventType.OPEN_TEXT,
  UserEventType.ADD_TO_DICTIONARY,
  UserEventType.FAIL_LOOKUP,
] as const;

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(query: FetchAdminAnalyticsDto) {
    const bounds = this.resolvePeriod(query);

    const [kpis, levelDistribution, activityHeatmap, eventsChart, topActiveUsers, topUnknownWords, readingFunnel, sm2Stats, difficultTexts, popularTexts, insight] =
      await Promise.all([
        this.getKpis(bounds),
        this.getLevelDistribution(bounds),
        this.getActivityHeatmap(bounds),
        this.getEventsChart(bounds),
        this.getTopActiveUsers(bounds, query.topUsersLimit ?? 5),
        this.getTopUnknownWords(query.topUnknownWordsLimit ?? 8),
        this.getReadingFunnel(bounds),
        this.getSm2Stats(bounds),
        this.getDifficultTexts(bounds, query.difficultBy ?? DifficultTextsTab.FAIL, query.difficultLimit ?? 6),
        this.getPopularTexts(bounds, query.popularBy ?? PopularTextsTab.OPENS, query.popularLimit ?? 7),
        this.getInsight(bounds),
      ]);

    return {
      filters: {
        range: query.range ?? AnalyticsRange.LAST_30_DAYS,
        dateFrom: bounds.from.toISOString(),
        dateTo: bounds.to.toISOString(),
        tz: bounds.tz,
      },
      insight,
      kpis,
      levelDistribution,
      activityHeatmap,
      eventsChart,
      topActiveUsers,
      difficultTexts,
      popularTexts,
      topUnknownWords,
      readingFunnel,
      sm2Stats,
    };
  }

  async exportOverview(query: FetchAdminAnalyticsDto, format: AnalyticsExportFormat) {
    const payload = await this.getOverview(query);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const baseName = `admin-analytics-${stamp}`;

    if (format === AnalyticsExportFormat.CSV) {
      return {
        format,
        fileName: `${baseName}.csv`,
        content: this.toCsv(payload),
      };
    }

    return {
      format: AnalyticsExportFormat.JSON,
      fileName: `${baseName}.json`,
      content: JSON.stringify(payload, null, 2),
    };
  }

  async getComplexTexts(opts: ComplexTextsLegacyOptions) {
    const query: FetchAdminAnalyticsDto = {
      dateFrom: opts.dateFrom,
      dateTo: opts.dateTo,
      difficultBy: DifficultTextsTab.FAIL,
      difficultLimit: opts.limit,
      tz: "UTC",
    };
    const bounds = this.resolvePeriod(query);
    const result = await this.getDifficultTexts(
      bounds,
      DifficultTextsTab.FAIL,
      opts.limit ?? 50,
    );

    return result.items.map((item) => ({
      textId: item.textId,
      failLookupCount: item.metricValue,
    }));
  }

  async getPopularLevels(opts: PopularLevelsLegacyOptions) {
    const query: FetchAdminAnalyticsDto = {
      dateFrom: opts.dateFrom,
      dateTo: opts.dateTo,
      tz: "UTC",
    };
    const bounds = this.resolvePeriod(query);

    const events = await this.prisma.userEvent.findMany({
      where: {
        type: UserEventType.OPEN_TEXT,
        createdAt: { gte: bounds.from, lte: bounds.to },
      },
      select: { metadata: true },
    });

    const textIdCounts = new Map<string, number>();
    for (const event of events) {
      const textId = this.getMetadataString(event.metadata, "textId");
      if (!textId) continue;
      textIdCounts.set(textId, (textIdCounts.get(textId) ?? 0) + 1);
    }

    if (!textIdCounts.size) return [];

    const texts = await this.prisma.text.findMany({
      where: { id: { in: [...textIdCounts.keys()] } },
      select: { id: true, level: true },
    });

    const countsByLevel = new Map<Level, number>();
    for (const text of texts) {
      if (!text.level) continue;
      countsByLevel.set(
        text.level,
        (countsByLevel.get(text.level) ?? 0) + (textIdCounts.get(text.id) ?? 0),
      );
    }

    return [...countsByLevel.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([level, openCount]) => ({ level, openCount }));
  }

  async getDifficultTextsEndpoint(
    query: FetchAdminAnalyticsDto,
    tab: DifficultTextsTab,
  ) {
    const bounds = this.resolvePeriod(query);
    return this.getDifficultTexts(bounds, tab, query.difficultLimit ?? 6);
  }

  async getPopularTextsEndpoint(query: FetchAdminAnalyticsDto, tab: PopularTextsTab) {
    const bounds = this.resolvePeriod(query);
    return this.getPopularTexts(bounds, tab, query.popularLimit ?? 7);
  }

  private resolvePeriod(query: FetchAdminAnalyticsDto): PeriodBounds {
    const now = new Date();
    const dateFrom = this.parseDate(query.dateFrom);
    const dateTo = this.parseDate(query.dateTo);

    let from: Date;
    let to: Date;

    if (dateFrom && dateTo) {
      from = dateFrom;
      to = dateTo;
    } else {
      const range = query.range ?? AnalyticsRange.LAST_30_DAYS;
      to = now;
      switch (range) {
        case AnalyticsRange.LAST_7_DAYS:
          from = new Date(now.getTime() - 7 * 86_400_000);
          break;
        case AnalyticsRange.LAST_90_DAYS:
          from = new Date(now.getTime() - 90 * 86_400_000);
          break;
        case AnalyticsRange.ALL:
          from = new Date(2020, 0, 1);
          break;
        case AnalyticsRange.LAST_30_DAYS:
        default:
          from = new Date(now.getTime() - 30 * 86_400_000);
          break;
      }
    }

    if (from > to) {
      const tmp = from;
      from = to;
      to = tmp;
    }

    const duration = to.getTime() - from.getTime();
    const prevTo = new Date(from);
    const prevFrom = new Date(from.getTime() - duration);

    return {
      from,
      to,
      prevFrom,
      prevTo,
      tz: query.tz ?? "UTC",
    };
  }

  private async getKpis(bounds: PeriodBounds) {
    const [readingNow, readingPrev, wordsNow, wordsPrev, unknownNow, unknownPrev, progressNow, progressPrev] =
      await Promise.all([
        this.prisma.userEvent.count({
          where: this.eventWhere(UserEventType.OPEN_TEXT, bounds.from, bounds.to),
        }),
        this.prisma.userEvent.count({
          where: this.eventWhere(UserEventType.OPEN_TEXT, bounds.prevFrom, bounds.prevTo),
        }),
        this.prisma.userEvent.count({
          where: this.eventWhere(UserEventType.ADD_TO_DICTIONARY, bounds.from, bounds.to),
        }),
        this.prisma.userEvent.count({
          where: this.eventWhere(
            UserEventType.ADD_TO_DICTIONARY,
            bounds.prevFrom,
            bounds.prevTo,
          ),
        }),
        this.prisma.userEvent.count({
          where: this.eventWhere(UserEventType.FAIL_LOOKUP, bounds.from, bounds.to),
        }),
        this.prisma.userEvent.count({
          where: this.eventWhere(UserEventType.FAIL_LOOKUP, bounds.prevFrom, bounds.prevTo),
        }),
        this.prisma.userTextProgress.findMany({
          where: { lastOpened: { gte: bounds.from, lte: bounds.to } },
          select: { progressPercent: true },
        }),
        this.prisma.userTextProgress.findMany({
          where: { lastOpened: { gte: bounds.prevFrom, lte: bounds.prevTo } },
          select: { progressPercent: true },
        }),
      ]);

    const completionNow = this.avgPercent(progressNow.map((item) => item.progressPercent));
    const completionPrev = this.avgPercent(progressPrev.map((item) => item.progressPercent));

    return {
      items: [
        this.kpiItem("reading_sessions", "Сессий чтения", readingNow, readingPrev, "count"),
        this.kpiItem("words_saved", "Слов в словарь", wordsNow, wordsPrev, "count"),
        this.kpiItem(
          "unknown_words",
          "Неизвестных слов",
          unknownNow,
          unknownPrev,
          "count",
        ),
        this.kpiItem(
          "avg_completion_rate",
          "Ср. завершение текста",
          completionNow,
          completionPrev,
          "percent",
        ),
      ],
    };
  }

  private async getLevelDistribution(bounds: PeriodBounds) {
    const events = await this.prisma.userEvent.findMany({
      where: this.eventWhere(UserEventType.OPEN_TEXT, bounds.from, bounds.to),
      select: { userId: true },
    });

    const userIds = [...new Set(events.map((event) => event.userId))];
    if (!userIds.length) {
      return { totalUsers: 0, items: [] as LevelDistributionItem[] };
    }

    const grouped = await this.prisma.user.groupBy({
      by: ["level"],
      where: { id: { in: userIds }, level: { not: null } },
      _count: { id: true },
    });

    const total = grouped.reduce((sum, item) => sum + item._count.id, 0);

    const byLevel = new Map<Level, number>();
    for (const item of grouped) {
      if (!item.level) continue;
      byLevel.set(item.level, item._count.id);
    }

    return {
      totalUsers: total,
      items: LEVEL_ORDER.map((level) => {
        const usersCount = byLevel.get(level) ?? 0;
        const percent = total > 0 ? Math.round((usersCount / total) * 100) : 0;
        return {
          level,
          levelLabel: LEVEL_LABELS[level],
          usersCount,
          percent,
        };
      }),
    };
  }

  private async getActivityHeatmap(bounds: PeriodBounds) {
    const events = await this.prisma.userEvent.findMany({
      where: this.eventWhere(UserEventType.OPEN_TEXT, bounds.from, bounds.to),
      select: { createdAt: true },
    });

    const raw: number[][] = Array.from({ length: 24 }, () => Array(7).fill(0));
    for (const event of events) {
      const hour = this.getHourInTimezone(event.createdAt, bounds.tz);
      const dayIndex = this.getDayIndexInTimezone(event.createdAt, bounds.tz);
      raw[hour][dayIndex] += 1;
    }

    const maxValue = raw.reduce((m, row) => Math.max(m, ...row), 0);
    const scaled = raw.map((row) =>
      row.map((value) => {
        if (value === 0 || maxValue === 0) return 0;
        return Math.max(1, Math.round((value / maxValue) * 5));
      }),
    );

    return {
      days: HEATMAP_DAYS,
      hours: scaled.map((values, hour) => ({ hour, values })),
      maxCount: maxValue,
    };
  }

  private async getEventsChart(bounds: PeriodBounds) {
    const events = await this.prisma.userEvent.findMany({
      where: {
        type: { in: [...INTERESTING_EVENT_TYPES] },
        createdAt: { gte: bounds.from, lte: bounds.to },
      },
      select: { type: true, createdAt: true },
    });

    const dateKeys = this.enumerateDateKeys(bounds.from, bounds.to, bounds.tz);
    const indexByDate = new Map(dateKeys.map((key, idx) => [key, idx]));

    const openText = new Array<number>(dateKeys.length).fill(0);
    const addToDict = new Array<number>(dateKeys.length).fill(0);
    const failLookup = new Array<number>(dateKeys.length).fill(0);

    for (const event of events) {
      const key = this.formatDateKey(event.createdAt, bounds.tz);
      const idx = indexByDate.get(key);
      if (idx === undefined) continue;

      if (event.type === UserEventType.OPEN_TEXT) openText[idx] += 1;
      if (event.type === UserEventType.ADD_TO_DICTIONARY) addToDict[idx] += 1;
      if (event.type === UserEventType.FAIL_LOOKUP) failLookup[idx] += 1;
    }

    return {
      labels: dateKeys,
      series: {
        openText,
        addToDict,
        failLookup,
      },
      totals: {
        openText: openText.reduce((sum, n) => sum + n, 0),
        addToDict: addToDict.reduce((sum, n) => sum + n, 0),
        failLookup: failLookup.reduce((sum, n) => sum + n, 0),
      },
    };
  }

  private async getTopActiveUsers(bounds: PeriodBounds, limit: number) {
    const grouped = await this.prisma.userEvent.groupBy({
      by: ["userId"],
      where: {
        type: { in: [...INTERESTING_EVENT_TYPES] },
        createdAt: { gte: bounds.from, lte: bounds.to },
      },
      _count: { _all: true },
      orderBy: { _count: { userId: "desc" } },
      take: limit,
    });

    const userIds = grouped.map((item) => item.userId);
    if (!userIds.length) return [];

    const [users, allUserEvents] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, surname: true, level: true },
      }),
      this.prisma.userEvent.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));
    const eventsByUser = new Map<string, Date[]>();
    for (const event of allUserEvents) {
      const list = eventsByUser.get(event.userId) ?? [];
      list.push(event.createdAt);
      eventsByUser.set(event.userId, list);
    }

    return grouped.map((item) => {
      const user = userMap.get(item.userId);
      const fullName = user
        ? `${user.name} ${user.surname}`.trim()
        : `Пользователь ${item.userId.slice(0, 6)}`;

      return {
        userId: item.userId,
        fullName,
        initials: this.initials(fullName),
        level: user?.level ?? null,
        streakDays: this.computeStreakDays(eventsByUser.get(item.userId) ?? []),
        eventsCount: item._count._all,
      };
    });
  }

  private async getTopUnknownWords(limit: number) {
    const items = await this.prisma.unknownWord.findMany({
      orderBy: [{ seenCount: "desc" }, { lastSeen: "desc" }],
      take: limit,
      select: { word: true, normalized: true, seenCount: true },
    });

    const maxCount = items[0]?.seenCount ?? 0;
    return items.map((item, idx) => ({
      rank: idx + 1,
      word: item.word || item.normalized,
      count: item.seenCount,
      percentOfTop: maxCount > 0 ? Math.round((item.seenCount / maxCount) * 100) : 0,
    }));
  }

  private async getReadingFunnel(bounds: PeriodBounds) {
    const [openedEventsCount, progressRows] = await Promise.all([
      this.prisma.userEvent.count({
        where: this.eventWhere(UserEventType.OPEN_TEXT, bounds.from, bounds.to),
      }),
      this.prisma.userTextProgress.findMany({
        where: { lastOpened: { gte: bounds.from, lte: bounds.to } },
        select: { progressPercent: true },
      }),
    ]);

    // Keep funnel percentages on one denominator for consistent conversion rates.
    const base = progressRows.length;
    const openedCount = base;
    const read25Count = progressRows.filter((row) => row.progressPercent >= 25).length;
    const read50Count = progressRows.filter((row) => row.progressPercent >= 50).length;
    const read75Count = progressRows.filter((row) => row.progressPercent >= 75).length;
    const completedCount = progressRows.filter((row) => row.progressPercent >= 100).length;

    const percent = (value: number) => (base > 0 ? Math.round((value / base) * 100) : 0);

    return {
      openedCount,
      openedEventsCount,
      read25Count,
      read50Count,
      read75Count,
      completedCount,
      read25Percent: percent(read25Count),
      read50Percent: percent(read50Count),
      read75Percent: percent(read75Count),
      completedPercent: percent(completedCount),
    };
  }

  private async getSm2Stats(bounds: PeriodBounds) {
    const [totalNow, totalPrev, avgQuality, correctNow, progressInPeriod] =
      await Promise.all([
        this.prisma.userReviewLog.count({
          where: { createdAt: { gte: bounds.from, lte: bounds.to } },
        }),
        this.prisma.userReviewLog.count({
          where: { createdAt: { gte: bounds.prevFrom, lte: bounds.prevTo } },
        }),
        this.prisma.userReviewLog.aggregate({
          where: { createdAt: { gte: bounds.from, lte: bounds.to } },
          _avg: { quality: true },
        }),
        this.prisma.userReviewLog.count({
          where: { createdAt: { gte: bounds.from, lte: bounds.to }, correct: true },
        }),
        this.prisma.userWordProgress.aggregate({
          where: { lastSeen: { gte: bounds.from, lte: bounds.to } },
          _avg: { interval: true, easeFactor: true },
        }),
      ]);

    let avgIntervalDays = progressInPeriod._avg.interval ?? null;
    let avgEaseFactor = progressInPeriod._avg.easeFactor ?? null;

    if (avgIntervalDays === null || avgEaseFactor === null) {
      const fallback = await this.prisma.userWordProgress.aggregate({
        _avg: { interval: true, easeFactor: true },
      });
      avgIntervalDays = avgIntervalDays ?? fallback._avg.interval ?? 0;
      avgEaseFactor = avgEaseFactor ?? fallback._avg.easeFactor ?? 0;
    }

    const retentionRatePercent =
      totalNow > 0 ? Math.round((correctNow / totalNow) * 100) : 0;

    return {
      totalReviews: totalNow,
      totalReviewsChangePercent: this.percentChange(totalNow, totalPrev),
      avgGrade: Number((avgQuality._avg.quality ?? 0).toFixed(1)),
      retentionRatePercent,
      avgIntervalDays: Number((avgIntervalDays ?? 0).toFixed(1)),
      avgEaseFactor: Number((avgEaseFactor ?? 0).toFixed(2)),
    };
  }

  private async getDifficultTexts(
    bounds: PeriodBounds,
    tab: DifficultTextsTab,
    limit: number,
  ) {
    if (tab === DifficultTextsTab.UNKNOWN_PERCENT) {
      return this.getDifficultByUnknownPercent(bounds, limit);
    }
    if (tab === DifficultTextsTab.ABANDON) {
      return this.getDifficultByAbandon(bounds, limit);
    }
    return this.getDifficultByFailLookup(bounds, limit);
  }

  private async getDifficultByFailLookup(bounds: PeriodBounds, limit: number) {
    const events = await this.prisma.userEvent.findMany({
      where: this.eventWhere(UserEventType.FAIL_LOOKUP, bounds.from, bounds.to),
      select: { metadata: true },
    });

    const counts = new Map<string, number>();
    for (const event of events) {
      const textId = this.getMetadataString(event.metadata, "textId");
      if (!textId) continue;
      counts.set(textId, (counts.get(textId) ?? 0) + 1);
    }

    return this.buildTextMetricList({
      metricLabel: "FAIL/период",
      metricKind: DifficultTextsTab.FAIL,
      valuesByTextId: counts,
      limit,
      largerIsWorse: true,
    });
  }

  private async getDifficultByUnknownPercent(bounds: PeriodBounds, limit: number) {
    const [openEvents, failEvents] = await Promise.all([
      this.prisma.userEvent.findMany({
        where: this.eventWhere(UserEventType.OPEN_TEXT, bounds.from, bounds.to),
        select: { metadata: true },
      }),
      this.prisma.userEvent.findMany({
        where: this.eventWhere(UserEventType.FAIL_LOOKUP, bounds.from, bounds.to),
        select: { metadata: true },
      }),
    ]);

    const opensByText = this.countByTextId(openEvents);
    const failByText = this.countByTextId(failEvents);

    const ratio = new Map<string, number>();
    for (const [textId, opens] of opensByText.entries()) {
      if (opens <= 0) continue;
      const fail = failByText.get(textId) ?? 0;
      ratio.set(textId, Number(((fail / opens) * 100).toFixed(1)));
    }

    return this.buildTextMetricList({
      metricLabel: "% незнакомых",
      metricKind: DifficultTextsTab.UNKNOWN_PERCENT,
      valuesByTextId: ratio,
      limit,
      largerIsWorse: true,
    });
  }

  private async getDifficultByAbandon(bounds: PeriodBounds, limit: number) {
    const progress = await this.prisma.userTextProgress.findMany({
      where: { lastOpened: { gte: bounds.from, lte: bounds.to } },
      select: { textId: true, progressPercent: true },
    });

    const totals = new Map<string, number>();
    const abandoned = new Map<string, number>();
    for (const row of progress) {
      totals.set(row.textId, (totals.get(row.textId) ?? 0) + 1);
      if (row.progressPercent < 75) {
        abandoned.set(row.textId, (abandoned.get(row.textId) ?? 0) + 1);
      }
    }

    const values = new Map<string, number>();
    for (const [textId, total] of totals.entries()) {
      if (total <= 0) continue;
      const count = abandoned.get(textId) ?? 0;
      values.set(textId, Number(((count / total) * 100).toFixed(1)));
    }

    return this.buildTextMetricList({
      metricLabel: "% брошенных",
      metricKind: DifficultTextsTab.ABANDON,
      valuesByTextId: values,
      limit,
      largerIsWorse: true,
    });
  }

  private async getPopularTexts(bounds: PeriodBounds, tab: PopularTextsTab, limit: number) {
    if (tab === PopularTextsTab.COMPLETE) {
      return this.getPopularByCompletions(bounds, limit);
    }
    if (tab === PopularTextsTab.SAVED) {
      return this.getPopularBySavedWords(bounds, limit);
    }
    return this.getPopularByOpens(bounds, limit);
  }

  private async getPopularByOpens(bounds: PeriodBounds, limit: number) {
    const events = await this.prisma.userEvent.findMany({
      where: this.eventWhere(UserEventType.OPEN_TEXT, bounds.from, bounds.to),
      select: { metadata: true },
    });

    return this.buildPopularTextsList({
      tab: PopularTextsTab.OPENS,
      metricLabel: "Открытий",
      valuesByTextId: this.countByTextId(events),
      limit,
    });
  }

  private async getPopularByCompletions(bounds: PeriodBounds, limit: number) {
    const rows = await this.prisma.userTextProgress.findMany({
      where: {
        lastOpened: { gte: bounds.from, lte: bounds.to },
        progressPercent: { gte: 100 },
      },
      select: { textId: true },
    });

    const values = new Map<string, number>();
    for (const row of rows) {
      values.set(row.textId, (values.get(row.textId) ?? 0) + 1);
    }

    return this.buildPopularTextsList({
      tab: PopularTextsTab.COMPLETE,
      metricLabel: "Завершений",
      valuesByTextId: values,
      limit,
    });
  }

  private async getPopularBySavedWords(bounds: PeriodBounds, limit: number) {
    const events = await this.prisma.userEvent.findMany({
      where: this.eventWhere(UserEventType.ADD_TO_DICTIONARY, bounds.from, bounds.to),
      select: { userId: true, metadata: true, createdAt: true },
    });

    const direct = new Map<string, number>();
    const unresolvedEvents: { pairKey: string; createdAt: Date }[] = [];

    for (const event of events) {
      const textId = this.getMetadataString(event.metadata, "textId");
      if (textId) {
        direct.set(textId, (direct.get(textId) ?? 0) + 1);
        continue;
      }
      const lemmaId = this.getMetadataString(event.metadata, "lemmaId");
      if (!lemmaId) continue;
      unresolvedEvents.push({
        pairKey: `${event.userId}|${lemmaId}`,
        createdAt: event.createdAt,
      });
    }

    if (unresolvedEvents.length) {
      const uniquePairs = [...new Set(unresolvedEvents.map((item) => item.pairKey))];
      const userIds = [...new Set(uniquePairs.map((key) => key.split("|")[0]))];
      const lemmaIds = [...new Set(uniquePairs.map((key) => key.split("|")[1]))];

      const contexts = await this.prisma.wordContext.findMany({
        where: {
          userId: { in: userIds },
          lemmaId: { in: lemmaIds },
          seenAt: { gte: bounds.from, lte: bounds.to },
        },
        select: { userId: true, lemmaId: true, textId: true, seenAt: true },
        orderBy: { seenAt: "desc" },
      });

      const contextsByPair = new Map<
        string,
        Array<{ textId: string; seenAt: Date }>
      >();
      for (const context of contexts) {
        const key = `${context.userId}|${context.lemmaId}`;
        const list = contextsByPair.get(key) ?? [];
        list.push({ textId: context.textId, seenAt: context.seenAt });
        contextsByPair.set(key, list);
      }

      for (const unresolved of unresolvedEvents) {
        const list = contextsByPair.get(unresolved.pairKey) ?? [];
        if (!list.length) continue;

        const matched =
          list.find((item) => item.seenAt <= unresolved.createdAt) ?? list[0];
        const textId = matched?.textId;
        if (!textId) continue;
        direct.set(textId, (direct.get(textId) ?? 0) + 1);
      }
    }

    return this.buildPopularTextsList({
      tab: PopularTextsTab.SAVED,
      metricLabel: "Слов сохранено",
      valuesByTextId: direct,
      limit,
    });
  }

  private async buildTextMetricList(params: {
    metricLabel: string;
    metricKind: DifficultTextsTab;
    valuesByTextId: Map<string, number>;
    limit: number;
    largerIsWorse: boolean;
  }) {
    const sorted = [...params.valuesByTextId.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, params.limit);

    const textIds = sorted.map(([textId]) => textId);
    const details = await this.getTextDetails(textIds);

    return {
      tab: params.metricKind,
      items: sorted.map(([textId, metricValue], idx) => {
        const detail = details.get(textId);
        return {
          rank: idx + 1,
          textId,
          title: detail?.title ?? "Без названия",
          level: detail?.level ?? null,
          wordsCount: detail?.wordsCount ?? 0,
          metricValue,
          metricLabel: params.metricLabel,
          metricColor: this.metricColor(metricValue, sorted.map((v) => v[1]), params.largerIsWorse),
        };
      }),
    };
  }

  private async buildPopularTextsList(params: {
    tab: PopularTextsTab;
    metricLabel: string;
    valuesByTextId: Map<string, number>;
    limit: number;
  }) {
    const sorted = [...params.valuesByTextId.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, params.limit);

    const textIds = sorted.map(([textId]) => textId);
    const details = await this.getTextDetails(textIds);

    return {
      tab: params.tab,
      items: sorted.map(([textId, metricValue], idx) => {
        const detail = details.get(textId);
        return {
          rank: idx + 1,
          textId,
          title: detail?.title ?? "Без названия",
          author: detail?.author ?? null,
          level: detail?.level ?? null,
          metricValue,
          metricLabel: params.metricLabel,
        };
      }),
    };
  }

  private async getTextDetails(textIds: string[]) {
    if (!textIds.length) return new Map<string, { title: string; level: Level | null; author: string | null; wordsCount: number }>();

    const [texts, versions] = await Promise.all([
      this.prisma.text.findMany({
        where: { id: { in: textIds } },
        select: { id: true, title: true, level: true, author: true },
      }),
      this.prisma.textProcessingVersion.findMany({
        where: { textId: { in: textIds } },
        orderBy: { version: "desc" },
        select: { id: true, textId: true },
      }),
    ]);

    const latestVersionByTextId = new Map<string, string>();
    for (const version of versions) {
      if (!latestVersionByTextId.has(version.textId)) {
        latestVersionByTextId.set(version.textId, version.id);
      }
    }

    const tokenCounts = await this.prisma.textToken.groupBy({
      by: ["versionId"],
      where: { versionId: { in: [...latestVersionByTextId.values()] } },
      _count: { id: true },
    });

    const countByVersion = new Map(tokenCounts.map((row) => [row.versionId, row._count.id]));

    return new Map(
      texts.map((text) => {
        const versionId = latestVersionByTextId.get(text.id);
        const wordsCount = versionId ? (countByVersion.get(versionId) ?? 0) : 0;
        return [
          text.id,
          {
            title: text.title,
            level: text.level,
            author: text.author,
            wordsCount,
          },
        ];
      }),
    );
  }

  private async getInsight(bounds: PeriodBounds) {
    const [openEvents, failEvents] = await Promise.all([
      this.prisma.userEvent.findMany({
        where: this.eventWhere(UserEventType.OPEN_TEXT, bounds.from, bounds.to),
        select: { metadata: true },
      }),
      this.prisma.userEvent.findMany({
        where: this.eventWhere(UserEventType.FAIL_LOOKUP, bounds.from, bounds.to),
        select: { metadata: true },
      }),
    ]);

    const openByText = this.countByTextId(openEvents);
    const failByText = this.countByTextId(failEvents);
    const textIds = [...new Set([...openByText.keys(), ...failByText.keys()])];

    if (!textIds.length) {
      return {
        title: "Тренд",
        message: "Недостаточно данных за выбранный период для построения инсайта.",
        severity: "info",
      };
    }

    const texts = await this.prisma.text.findMany({
      where: { id: { in: textIds }, level: { not: null } },
      select: { id: true, level: true },
    });

    const levelByTextId = new Map<string, Level>();
    for (const text of texts) {
      if (!text.level) continue;
      levelByTextId.set(text.id, text.level);
    }

    const failByLevel = new Map<Level, number>();
    const openByLevel = new Map<Level, number>();

    for (const [textId, count] of failByText.entries()) {
      const level = levelByTextId.get(textId);
      if (!level) continue;
      failByLevel.set(level, (failByLevel.get(level) ?? 0) + count);
    }

    for (const [textId, count] of openByText.entries()) {
      const level = levelByTextId.get(textId);
      if (!level) continue;
      openByLevel.set(level, (openByLevel.get(level) ?? 0) + count);
    }

    const levelRates = LEVEL_ORDER.map((level) => {
      const opens = openByLevel.get(level) ?? 0;
      const fails = failByLevel.get(level) ?? 0;
      const rate = opens > 0 ? fails / opens : 0;
      return { level, opens, fails, rate };
    }).filter((item) => item.opens > 0);

    if (levelRates.length < 2) {
      return {
        title: "Тренд",
        message: "За период мало сравнительных данных по уровням.",
        severity: "info",
      };
    }

    const sorted = [...levelRates].sort((a, b) => b.rate - a.rate);
    const top = sorted[0];
    const second = sorted[1];

    const diffPercent =
      second.rate > 0 ? Math.round(((top.rate - second.rate) / second.rate) * 100) : null;

    return {
      title: "Тренд",
      message:
        diffPercent !== null
          ? `Уровень ${top.level} показывает на ${diffPercent}% больше FAIL_LOOKUP на одно открытие, чем ${second.level}.`
          : `Уровень ${top.level} имеет самый высокий относительный FAIL_LOOKUP на открытие.`,
      severity: diffPercent !== null && diffPercent >= 25 ? "warning" : "info",
    };
  }

  private countByTextId(events: { metadata: Prisma.JsonValue | null }[]) {
    const counts = new Map<string, number>();
    for (const event of events) {
      const textId = this.getMetadataString(event.metadata, "textId");
      if (!textId) continue;
      counts.set(textId, (counts.get(textId) ?? 0) + 1);
    }
    return counts;
  }

  private eventWhere(type: UserEventType, from: Date, to: Date): Prisma.UserEventWhereInput {
    return {
      type,
      createdAt: { gte: from, lte: to },
    };
  }

  private parseDate(value?: string): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private avgPercent(values: number[]): number {
    if (!values.length) return 0;
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    return Math.round(avg);
  }

  private percentChange(current: number, previous: number): number | null {
    if (previous === 0) return null;
    return Math.round(((current - previous) / previous) * 100);
  }

  private kpiItem(
    key: string,
    label: string,
    current: number,
    previous: number,
    valueType: "count" | "percent",
  ) {
    const trend = this.buildTrend(current, previous, valueType === "percent" ? "pp" : "percent");

    return {
      key,
      label,
      value: valueType === "percent" ? Number(current.toFixed(1)) : current,
      valueFormatted:
        valueType === "percent" ? `${Math.round(current)}%` : this.formatNumber(current),
      changeType: trend.type,
      changeValue: trend.value,
      changeUnit: trend.unit,
      changeText:
        trend.type === "neutral"
          ? "без изменений"
          : `${trend.type === "up" ? "+" : "-"}${Math.abs(trend.value)}${trend.unit === "pp" ? " пп" : "%"}`,
    };
  }

  private buildTrend(current: number, previous: number, unit: "percent" | "pp"): TrendInfo {
    if (previous === 0 || current === previous) {
      return { type: "neutral", value: 0, unit };
    }
    if (unit === "pp") {
      const delta = Math.round((current - previous) * 10) / 10;
      return {
        type: delta > 0 ? "up" : "down",
        value: Number(Math.abs(delta).toFixed(1)),
        unit: "pp",
      };
    }
    const delta = this.percentChange(current, previous);
    if (delta === null || delta === 0) return { type: "neutral", value: 0, unit };
    return {
      type: delta > 0 ? "up" : "down",
      value: Math.abs(delta),
      unit,
    };
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat("ru-RU").format(value);
  }

  private enumerateDateKeys(from: Date, to: Date, tz: string): string[] {
    const keys: string[] = [];
    const cursor = new Date(from);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(0, 0, 0, 0);

    while (cursor <= end) {
      keys.push(this.formatDateKey(cursor, tz));
      cursor.setDate(cursor.getDate() + 1);
    }
    return keys;
  }

  private formatDateKey(date: Date, tz: string): string {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }

  private getHourInTimezone(date: Date, tz: string): number {
    const hour = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(date);
    const parsed = Number(hour);
    return Number.isNaN(parsed) ? date.getUTCHours() : parsed;
  }

  private getDayIndexInTimezone(date: Date, tz: string): number {
    const day = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
    }).format(date);
    const map: Record<string, number> = {
      Mon: 0,
      Tue: 1,
      Wed: 2,
      Thu: 3,
      Fri: 4,
      Sat: 5,
      Sun: 6,
    };
    if (day in map) return map[day];
    const utc = date.getUTCDay();
    return utc === 0 ? 6 : utc - 1;
  }

  private initials(fullName: string): string {
    const parts = fullName
      .split(" ")
      .map((part) => part.trim())
      .filter(Boolean);
    if (!parts.length) return "??";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  private computeStreakDays(dates: Date[]): number {
    if (!dates.length) return 0;
    const uniqueDays = [
      ...new Set(dates.map((d) => d.toISOString().slice(0, 10))),
    ].sort((a, b) => b.localeCompare(a));

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    if (uniqueDays[0] !== today && uniqueDays[0] !== yesterday) return 0;

    let streak = 0;
    let expected = uniqueDays[0];
    for (const day of uniqueDays) {
      if (day !== expected) break;
      streak += 1;
      const prev = new Date(expected);
      prev.setDate(prev.getDate() - 1);
      expected = prev.toISOString().slice(0, 10);
    }
    return streak;
  }

  private metricColor(value: number, allValues: number[], largerIsWorse: boolean) {
    if (!allValues.length) return "neutral";
    const max = Math.max(...allValues);
    const min = Math.min(...allValues);
    if (max === min) return "neutral";
    const normalized = (value - min) / (max - min);
    if (largerIsWorse) {
      if (normalized >= 0.75) return "red";
      if (normalized >= 0.5) return "amber";
      return "neutral";
    }
    if (normalized >= 0.75) return "green";
    if (normalized >= 0.5) return "blue";
    return "neutral";
  }

  private getMetadataString(metadata: Prisma.JsonValue | null, key: string): string | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const value = (metadata as Prisma.JsonObject)[key];
    return typeof value === "string" ? value : null;
  }

  private toCsv(payload: {
    kpis: { items: Array<{ key: string; value: number }> };
    levelDistribution: { items: LevelDistributionItem[] };
    topActiveUsers: Array<{ fullName: string; eventsCount: number }>;
    difficultTexts: { items: Array<{ title: string; metricValue: number }> };
    popularTexts: { items: Array<{ title: string; metricValue: number }> };
    topUnknownWords: Array<{ word: string; count: number }>;
    readingFunnel: { openedCount: number; completedPercent: number };
    sm2Stats: { totalReviews: number; retentionRatePercent: number };
  }): string {
    const rows: string[][] = [];
    rows.push(["section", "key", "value"]);

    for (const kpi of payload.kpis.items) {
      rows.push(["kpi", kpi.key, String(kpi.value)]);
    }

    for (const level of payload.levelDistribution.items) {
      rows.push(["level_distribution", level.level, String(level.usersCount)]);
    }

    for (const user of payload.topActiveUsers) {
      rows.push(["top_active_users", user.fullName, String(user.eventsCount)]);
    }

    for (const item of payload.difficultTexts.items) {
      rows.push(["difficult_texts", item.title, String(item.metricValue)]);
    }

    for (const item of payload.popularTexts.items) {
      rows.push(["popular_texts", item.title, String(item.metricValue)]);
    }

    for (const word of payload.topUnknownWords) {
      rows.push(["top_unknown_words", word.word, String(word.count)]);
    }

    rows.push(["reading_funnel", "openedCount", String(payload.readingFunnel.openedCount)]);
    rows.push(["reading_funnel", "completedPercent", String(payload.readingFunnel.completedPercent)]);

    rows.push(["sm2", "totalReviews", String(payload.sm2Stats.totalReviews)]);
    rows.push(["sm2", "retentionRatePercent", String(payload.sm2Stats.retentionRatePercent)]);

    return rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
  }
}

