import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { TrackingService } from "./tracking.service";
import { GeoIpService } from "./geoip.service";
import { categorizeReferrer, type ReferrerCategory } from "./referrer-categorization";

export type Granularity = "day" | "week" | "month";
export type Metric =
  | "pageviews"
  | "uniqueVisitors"
  | "sessions"
  | "totalEvents"
  | "bounceRate"
  | "avgSessionSec";

export interface RangeOptions {
  from?: Date;
  to?: Date;
}

const DEFAULT_DAYS = 30;
const AGGREGATOR_HEALTHY_MS = 2 * 60 * 60 * 1000;

@Injectable()
export class TrackingAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tracking: TrackingService,
    private readonly geoip: GeoIpService,
  ) {}

  async realtime(): Promise<{
    realtimeVisitors: number;
    queueSize: number;
    eventsPerMinute: number;
  }> {
    const oneMinAgo = new Date(Date.now() - 60 * 1000);
    const [realtimeVisitors, queueSize, perMinRow] = await Promise.all([
      this.tracking.getRealtimeVisitors(),
      this.tracking.queueSize(),
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count
        FROM "tracking_event"
        WHERE "createdAt" >= ${oneMinAgo}
      `,
    ]);
    return {
      realtimeVisitors,
      queueSize,
      eventsPerMinute: Number(perMinRow[0]?.count ?? 0),
    };
  }

  async overview(opts: RangeOptions) {
    const { from, to } = normalizeRange(opts, DEFAULT_DAYS);
    const periodMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - periodMs);
    const prevTo = from;

    const [current, previous, realtime, queueSize, aggregatorLastRun] =
      await Promise.all([
        this.sumRange(from, to),
        this.sumRange(prevFrom, prevTo),
        this.tracking.getRealtimeVisitors(),
        this.tracking.queueSize(),
        this.tracking.getAggregatorLastRun(),
      ]);

    return {
      range: { from, to },
      previousRange: { from: prevFrom, to: prevTo },
      current,
      previous,
      realtimeVisitors: realtime,
      queueSize,
      aggregator: buildAggregatorStatus(aggregatorLastRun),
    };
  }

  async timeseries(metric: Metric, granularity: Granularity, opts: RangeOptions) {
    const { from, to } = normalizeRange(opts, DEFAULT_DAYS);
    return this.computeTimeseries(metric, granularity, from, to);
  }

  async timeseriesWithCompare(metric: Metric, granularity: Granularity, opts: RangeOptions) {
    const { from, to } = normalizeRange(opts, DEFAULT_DAYS);
    const periodMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - periodMs);

    const [current, previous] = await Promise.all([
      this.computeTimeseries(metric, granularity, from, to),
      this.computeTimeseries(metric, granularity, prevFrom, from),
    ]);

    return {
      range: { from, to },
      previousRange: { from: prevFrom, to: from },
      current,
      previous,
    };
  }

  private async computeTimeseries(
    metric: Metric,
    granularity: Granularity,
    from: Date,
    to: Date,
  ): Promise<{ date: Date; value: number }[]> {
    if (metric === "uniqueVisitors" && (granularity === "week" || granularity === "month")) {
      return this.computeUniqueVisitorsBucketed(granularity, from, to);
    }

    const rows = await this.prisma.trackingDailyStats.findMany({
      where: { date: { gte: from, lt: to } },
      orderBy: { date: "asc" },
    });

    const daily = rows.map((r) => ({ date: r.date, value: extractMetric(r, metric) }));
    if (granularity === "day") return daily;

    const buckets = new Map<string, { date: Date; sum: number; count: number }>();
    for (const d of daily) {
      const bucketStart = bucketStartFor(d.date, granularity);
      const key = bucketStart.toISOString();
      const b = buckets.get(key);
      if (b) { b.sum += d.value; b.count += 1; }
      else buckets.set(key, { date: bucketStart, sum: d.value, count: 1 });
    }

    const isAverage = metric === "bounceRate" || metric === "avgSessionSec";
    return Array.from(buckets.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((b) => ({ date: b.date, value: isAverage ? b.sum / b.count : b.sum }));
  }

  private async computeUniqueVisitorsBucketed(
    granularity: "week" | "month",
    from: Date,
    to: Date,
  ): Promise<{ date: Date; value: number }[]> {
    const truncField = granularity === "week" ? "week" : "month";
    const rows = await this.prisma.$queryRaw<{ bucket: Date; count: bigint }[]>`
      SELECT date_trunc(${truncField}, "createdAt" AT TIME ZONE 'UTC')::date AS bucket,
             COUNT(DISTINCT "visitorId")::bigint AS count
      FROM "tracking_event"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      GROUP BY bucket
      ORDER BY bucket
    `;
    return rows.map((r) => ({ date: r.bucket, value: Number(r.count) }));
  }

  async timeseriesSummary(metric: Metric, granularity: Granularity, opts: RangeOptions) {
    const { from, to } = normalizeRange(opts, DEFAULT_DAYS);
    const points = await this.computeTimeseries(metric, granularity, from, to);

    if (points.length === 0) {
      return {
        range: { from, to }, points: 0, total: 0, avg: 0, peak: null, min: null,
        ...(metric === "uniqueVisitors" ? { distinctTotal: 0 } : {}),
      };
    }

    let peak = points[0];
    let min = points[0];
    let sum = 0;
    for (const p of points) {
      sum += p.value;
      if (p.value > peak.value) peak = p;
      if (p.value < min.value) min = p;
    }
    const isAverage = metric === "bounceRate" || metric === "avgSessionSec";
    const total = isAverage ? sum / points.length : sum;
    const avg = sum / points.length;

    const base = {
      range: { from, to },
      points: points.length,
      total,
      avg,
      peak: { date: peak.date, value: peak.value },
      min: { date: min.date, value: min.value },
    };

    if (metric === "uniqueVisitors") {
      const r = await this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT "visitorId")::bigint AS count
        FROM "tracking_event"
        WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      `;
      return { ...base, distinctTotal: Number(r[0]?.count ?? 0) };
    }

    return base;
  }

  async timeseriesMulti(metrics: Metric[], granularity: Granularity, opts: RangeOptions) {
    const { from, to } = normalizeRange(opts, DEFAULT_DAYS);
    const rows = await this.prisma.trackingDailyStats.findMany({
      where: { date: { gte: from, lt: to } },
      orderBy: { date: "asc" },
    });

    const out = {} as Record<Metric, { date: Date; value: number }[]>;
    for (const metric of metrics) {
      if (metric === "uniqueVisitors" && (granularity === "week" || granularity === "month")) {
        out[metric] = await this.computeUniqueVisitorsBucketed(granularity, from, to);
        continue;
      }
      const daily = rows.map((r) => ({ date: r.date, value: extractMetric(r, metric) }));
      if (granularity === "day") { out[metric] = daily; continue; }

      const buckets = new Map<string, { date: Date; sum: number; count: number }>();
      for (const d of daily) {
        const bucketStart = bucketStartFor(d.date, granularity);
        const key = bucketStart.toISOString();
        const b = buckets.get(key);
        if (b) { b.sum += d.value; b.count += 1; }
        else buckets.set(key, { date: bucketStart, sum: d.value, count: 1 });
      }
      const isAverage = metric === "bounceRate" || metric === "avgSessionSec";
      out[metric] = Array.from(buckets.values())
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .map((b) => ({ date: b.date, value: isAverage ? b.sum / b.count : b.sum }));
    }
    return out;
  }

  async topPaths(opts: RangeOptions, limit = 20) {
    return this.topFromJsonArray("topPaths", opts, limit);
  }

  async listPages(
    opts: RangeOptions,
    { limit, offset, search, country }: { limit: number; offset: number; search?: string; country?: string },
  ): Promise<{ items: { key: string; count: number }[]; total: number; limit: number; offset: number }> {
    const { from, to } = normalizeRange(opts, DEFAULT_DAYS);
    const safeLimit = Math.min(Math.max(limit, 1), 1000);
    const safeOffset = Math.max(offset, 0);
    const searchPattern = buildLikePattern(search);
    const countryFilter = countrySqlFilter(country);

    const rows = await this.prisma.$queryRaw<{ path: string; c: bigint; total: bigint }>(
      Prisma.sql`
        WITH per_path AS (
          SELECT "path", COUNT(*)::bigint AS c
          FROM "tracking_event"
          WHERE "eventType" = 'pageview'
            AND "createdAt" >= ${from}
            AND "createdAt" < ${to}
            AND "path" IS NOT NULL
            AND (${searchPattern}::text IS NULL OR "path" ILIKE ${searchPattern})
            ${countryFilter}
          GROUP BY "path"
        )
        SELECT "path", c, COUNT(*) OVER ()::bigint AS total
        FROM per_path
        ORDER BY c DESC, "path" ASC
        LIMIT ${safeLimit} OFFSET ${safeOffset}
      `,
    );

    const rowsArr = Array.isArray(rows) ? rows : [];
    const total = rowsArr.length > 0 ? Number(rowsArr[0].total) : 0;
    return { items: rowsArr.map((r) => ({ key: r.path, count: Number(r.c) })), total, limit: safeLimit, offset: safeOffset };
  }

  async topReferrers(opts: RangeOptions, limit = 20, offset = 0, category?: ReferrerCategory) {
    // When filtering by category we need all entries to filter correctly,
    // but cap at a reasonable ceiling to avoid merging thousands of rows.
    const fetchLimit = category ? 5_000 : limit + offset + 1;
    const raw = await this.topFromJsonArray("topReferrers", opts, fetchLimit);
    const enriched = raw.map((r) => ({ ...r, category: categorizeReferrer(r.key) }));
    const filtered = category ? enriched.filter((r) => r.category === category) : enriched;
    return filtered.slice(offset, offset + limit);
  }

  async referrerBreakdown(opts: RangeOptions) {
    const { from, to } = normalizeRange(opts, DEFAULT_DAYS);
    const rows = await this.prisma.$queryRaw<{ host: string | null; count: bigint }[]>`
      SELECT "referrer" AS host, COUNT(*)::bigint AS count
      FROM "tracking_event"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
        AND "eventType" = 'pageview'
      GROUP BY "referrer"
    `;

    const EMPTY_CAT = () => ({ count: 0, share: 0, sampleHosts: [] as string[], _hosts: [] as { host: string; count: number }[] });
    const buckets: Record<ReferrerCategory, ReturnType<typeof EMPTY_CAT>> = {
      search: EMPTY_CAT(), direct: EMPTY_CAT(), social: EMPTY_CAT(), other: EMPTY_CAT(),
    };

    let total = 0;
    const uniqueHostSet = new Set<string>();
    for (const row of rows) {
      const count = Number(row.count);
      total += count;
      const category = categorizeReferrer(row.host);
      const bucket = buckets[category];
      bucket.count += count;
      if (row.host) { uniqueHostSet.add(row.host); bucket._hosts.push({ host: row.host, count }); }
    }

    const byCategory = {} as Record<ReferrerCategory, { count: number; share: number; sampleHosts: string[] }>;
    for (const cat of ["search", "direct", "social", "other"] as const) {
      const b = buckets[cat];
      const sampleHosts = b._hosts.sort((a, z) => z.count - a.count).slice(0, 3).map((x) => x.host);
      byCategory[cat] = { count: b.count, share: total > 0 ? b.count / total : 0, sampleHosts };
    }

    return { range: { from, to }, total, uniqueHosts: uniqueHostSet.size, byCategory };
  }

  async topCountries(opts: RangeOptions, limit = 50) {
    return this.topFromJsonArray("topCountries", opts, limit);
  }

  async topCities(opts: RangeOptions, { limit, country }: { limit: number; country?: string }) {
    const { from, to } = normalizeRange(opts, DEFAULT_DAYS);
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const countryFilter = countrySqlFilter(country);

    const rows = await this.prisma.$queryRaw<{ city: string; country: string | null; count: bigint }[]>(
      Prisma.sql`
        SELECT "city", "country", COUNT(*)::bigint AS count
        FROM "tracking_event"
        WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
          AND "city" IS NOT NULL
          ${countryFilter}
        GROUP BY "city", "country"
        ORDER BY count DESC, "city" ASC
        LIMIT ${safeLimit}
      `,
    );
    return rows.map((r) => ({ key: r.city, country: r.country ?? "", count: Number(r.count) }));
  }

  async geographyStats(opts: RangeOptions) {
    const { from, to } = normalizeRange(opts, DEFAULT_DAYS);

    // Single query: aggregate totals + top country + top city in one pass.
    const rows = await this.prisma.$queryRaw<{
      total: bigint;
      with_country: bigint;
      with_city: bigint;
      unique_countries: bigint;
      unique_cities: bigint;
      top_country: string | null;
      top_city: string | null;
      top_city_country: string | null;
    }[]>`
      WITH base AS (
        SELECT "country", "city",
               COUNT(*)::bigint AS cnt
        FROM "tracking_event"
        WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
        GROUP BY "country", "city"
      ),
      totals AS (
        SELECT
          SUM(cnt)::bigint AS total,
          SUM(cnt) FILTER (WHERE "country" IS NOT NULL)::bigint AS with_country,
          SUM(cnt) FILTER (WHERE "city" IS NOT NULL)::bigint AS with_city,
          COUNT(DISTINCT "country")::bigint AS unique_countries,
          COUNT(DISTINCT CASE WHEN "city" IS NOT NULL THEN "country" || '|' || "city" END)::bigint AS unique_cities
        FROM base
      ),
      top_country AS (
        SELECT "country"
        FROM base
        WHERE "country" IS NOT NULL
        GROUP BY "country"
        ORDER BY SUM(cnt) DESC
        LIMIT 1
      ),
      top_city AS (
        SELECT "city", "country"
        FROM base
        WHERE "city" IS NOT NULL
        ORDER BY cnt DESC
        LIMIT 1
      )
      SELECT
        t.total, t.with_country, t.with_city, t.unique_countries, t.unique_cities,
        tc.country AS top_country,
        ci.city AS top_city,
        ci.country AS top_city_country
      FROM totals t
      LEFT JOIN top_country tc ON true
      LEFT JOIN top_city ci ON true
    `;

    const r = rows[0];
    return {
      totalEvents: Number(r?.total ?? 0),
      eventsWithCountry: Number(r?.with_country ?? 0),
      eventsWithCity: Number(r?.with_city ?? 0),
      uniqueCountries: Number(r?.unique_countries ?? 0),
      uniqueCities: Number(r?.unique_cities ?? 0),
      topCountry: r?.top_country ?? null,
      topCity: r?.top_city ?? null,
    };
  }

  async geoipStatus() {
    const base = this.geoip.getStatus();
    const WINDOW_DAYS = 7;
    const to = new Date();
    const from = new Date(to.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.$queryRaw<{ total: bigint; with_country: bigint }[]>`
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE "country" IS NOT NULL)::bigint AS with_country
      FROM "tracking_event"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
    `;
    const total = Number(rows[0]?.total ?? 0);
    const withCountry = Number(rows[0]?.with_country ?? 0);
    return {
      ...base,
      recent: {
        windowDays: WINDOW_DAYS,
        totalEvents: total,
        eventsWithCountry: withCountry,
        coverage: total > 0 ? roundTo(withCountry / total, 4) : 0,
      },
    };
  }

  async uaBreakdown(field: "device" | "browser" | "os", opts: RangeOptions) {
    const { from, to } = normalizeRange(opts, DEFAULT_DAYS);
    const column = Prisma.raw(`"${field}"`);

    const rows = await this.prisma.$queryRaw<{
      key: string | null;
      events: bigint;
      visitors: bigint;
    }[]>(
      Prisma.sql`
        SELECT
          ${column} AS key,
          COUNT(*)::bigint AS events,
          COUNT(DISTINCT "visitorId")::bigint AS visitors
        FROM "tracking_event"
        WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
        GROUP BY ${column}
      `,
    );

    const totalVisitorRow = await this.prisma.$queryRaw<{ total: bigint }[]>(
      Prisma.sql`
        SELECT COUNT(DISTINCT "visitorId")::bigint AS total
        FROM "tracking_event"
        WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      `,
    );
    const totalVisitors = Number(totalVisitorRow[0]?.total ?? 0);
    const merged = new Map<string, { events: number; visitors: number }>();
    let totalEvents = 0;
    for (const row of rows) {
      const events = Number(row.events);
      const visitors = Number(row.visitors);
      totalEvents += events;
      const key = normalizeUaKey(row.key);
      const bucket = merged.get(key) ?? { events: 0, visitors: 0 };
      bucket.events += events;
      bucket.visitors += visitors;
      merged.set(key, bucket);
    }

    const items = Array.from(merged.entries())
      .map(([key, b]) => ({ key, events: b.events, visitors: b.visitors, share: totalEvents > 0 ? b.events / totalEvents : 0 }))
      .sort((a, z) => z.events - a.events);

    return { range: { from, to }, totalEvents, totalVisitors, items };
  }

  async recentEvents(opts: { limit?: number; sinceId?: string; eventTypes?: string[] }) {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
    const where: Prisma.TrackingEventWhereInput = {};
    if (opts.sinceId) {
      try { where.id = { gt: BigInt(opts.sinceId) }; } catch { /* invalid sinceId */ }
    }
    if (opts.eventTypes && opts.eventTypes.length > 0) {
      where.eventType = { in: opts.eventTypes };
    }

    const items = await this.prisma.trackingEvent.findMany({
      where,
      orderBy: { id: "desc" },
      take: limit,
      select: { id: true, eventType: true, path: true, referrer: true, device: true, browser: true, os: true, country: true, userId: true, metadata: true, createdAt: true },
    });

    const userIds: string[] = Array.from(new Set(items.map((i) => i.userId).filter((x): x is string => x !== null)));
    const users = userIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true, name: true, avatar: true } })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));

    return items.map((i) => ({ ...i, id: i.id.toString(), user: i.userId ? (byId.get(i.userId) ?? null) : null }));
  }

  async topWordClicks(opts: RangeOptions, limit = 50) {
    const { from, to } = normalizeRange(opts, DEFAULT_DAYS);
    const rows = await this.prisma.$queryRaw<{ word: string; count: bigint }[]>`
      SELECT metadata->>'word' AS word, COUNT(*)::bigint AS count
      FROM "tracking_event"
      WHERE "eventType" = 'word_click'
        AND "createdAt" >= ${from}
        AND "createdAt" < ${to}
        AND metadata->>'word' IS NOT NULL
      GROUP BY metadata->>'word'
      ORDER BY count DESC
      LIMIT ${Math.min(limit, 500)}
    `;
    return rows.map((r) => ({ word: r.word, count: Number(r.count) }));
  }

  // Uses pre-aggregated daily stats for fast range queries.
  // Falls back to distinctVisitors from raw events for accurate unique visitor count.
  private async sumRange(from: Date, to: Date) {
    const [agg, distinctRow] = await Promise.all([
      this.prisma.trackingDailyStats.aggregate({
        where: { date: { gte: from, lt: to } },
        _sum: { uniqueVisitors: true, sessions: true, pageviews: true, totalEvents: true },
        _avg: { avgSessionSec: true, bounceRate: true },
        _count: { date: true },
      }),
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT "visitorId")::bigint AS count
        FROM "tracking_event"
        WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      `,
    ]);

    return {
      uniqueVisitors: Number(distinctRow[0]?.count ?? 0),
      uniqueVisitorsByDaySum: agg._sum.uniqueVisitors ?? 0,
      sessions: agg._sum.sessions ?? 0,
      pageviews: agg._sum.pageviews ?? 0,
      totalEvents: agg._sum.totalEvents ?? 0,
      avgSessionSec: Math.round(agg._avg.avgSessionSec ?? 0),
      bounceRate: agg._avg.bounceRate ?? 0,
      daysWithData: agg._count.date,
    };
  }

  private async topFromJsonArray(
    field: "topPaths" | "topReferrers" | "topCountries",
    opts: RangeOptions,
    limit: number,
  ) {
    const { from, to } = normalizeRange(opts, DEFAULT_DAYS);
    const rows = await this.prisma.trackingDailyStats.findMany({
      where: { date: { gte: from, lt: to } },
      select: { [field]: true },
    });

    const merged: Record<string, number> = {};
    for (const row of rows) {
      const arr = (row as Record<string, unknown>)[field] as { key: string; count: number }[] | null;
      if (!arr || !Array.isArray(arr)) continue;
      for (const item of arr) {
        if (!item?.key) continue;
        merged[item.key] = (merged[item.key] ?? 0) + (item.count ?? 0);
      }
    }

    return Object.entries(merged)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }
}

const extractMetric = (
  row: { pageviews: number; uniqueVisitors: number; sessions: number; totalEvents: number; bounceRate: number; avgSessionSec: number },
  metric: Metric,
): number => row[metric];

const normalizeRange = (opts: RangeOptions, defaultDays: number): { from: Date; to: Date } => {
  const to = opts.to ? startOfUtcDay(addDays(opts.to, 1)) : startOfUtcDay(addDays(new Date(), 1));
  const from = opts.from ? startOfUtcDay(opts.from) : startOfUtcDay(addDays(to, -defaultDays));
  return { from, to };
};

const startOfUtcDay = (d: Date): Date => {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
};

const addDays = (d: Date, delta: number): Date => {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + delta);
  return x;
};

const roundTo = (value: number, digits: number): number => {
  const m = Math.pow(10, digits);
  return Math.round(value * m) / m;
};

const buildLikePattern = (search: string | undefined): string | null => {
  const trimmed = search?.trim();
  if (!trimmed) return null;
  const escaped = trimmed.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  return `%${escaped}%`;
};

const countrySqlFilter = (country: string | undefined): Prisma.Sql => {
  const trimmed = country?.trim().toUpperCase();
  if (!trimmed || !/^[A-Z]{2}$/.test(trimmed)) return Prisma.empty;
  return Prisma.sql`AND "country" = ${trimmed}`;
};

const normalizeUaKey = (raw: string | null): string => {
  if (raw == null) return "Other";
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "unknown") return "Other";
  return trimmed;
};

const buildAggregatorStatus = (lastRunIso: string | null): { lastRunAt: string | null; isHealthy: boolean } => {
  if (!lastRunIso) return { lastRunAt: null, isHealthy: false };
  const lastRunMs = Date.parse(lastRunIso);
  if (Number.isNaN(lastRunMs)) return { lastRunAt: null, isHealthy: false };
  return { lastRunAt: lastRunIso, isHealthy: Date.now() - lastRunMs < AGGREGATOR_HEALTHY_MS };
};

const bucketStartFor = (d: Date, granularity: "week" | "month"): Date => {
  const x = startOfUtcDay(d);
  if (granularity === "month") { x.setUTCDate(1); return x; }
  const dow = x.getUTCDay();
  const diff = (dow + 6) % 7;
  x.setUTCDate(x.getUTCDate() - diff);
  return x;
};
