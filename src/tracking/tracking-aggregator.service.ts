import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "src/prisma.service";
import { TrackingService } from "./tracking.service";
import { DIRECT_REFERRER_KEY } from "./referrer-categorization";

type TopItem = { key: string; count: number };
type TopCityItem = { key: string; country: string; count: number };

// SQL aggregate rows returned per-day aggregation query
interface DayAggRow {
  visitorId: string;
  sessionId: string;
  eventType: string;
  path: string | null;
  referrer: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  city: string | null;
  minAt: Date;
  maxAt: Date;
  eventCount: bigint;
  pageviewCount: bigint;
}

@Injectable()
export class TrackingAggregatorService {
  private readonly logger = new Logger(TrackingAggregatorService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tracking: TrackingService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: "tracking-aggregate" })
  async aggregateRecent(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const today = startOfUtcDay(new Date());
      for (let offset = 0; offset < 3; offset++) {
        const day = new Date(today);
        day.setUTCDate(day.getUTCDate() - offset);
        await this.aggregateDay(day);
      }
      await this.tracking.setAggregatorLastRun();
    } catch (err) {
      this.logger.error(`aggregation failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  async aggregateDay(day: Date): Promise<void> {
    const from = startOfUtcDay(day);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 1);

    // Check if there are any events for this day before doing heavy work.
    const countResult = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n FROM "tracking_event"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
    `;
    const totalEvents = Number(countResult[0]?.n ?? 0);

    if (totalEvents === 0) {
      await this.prisma.trackingDailyStats.deleteMany({ where: { date: from } });
      return;
    }

    // Aggregate per (visitorId, sessionId, eventType, path, referrer, device, browser, os, country, city)
    // in PostgreSQL — avoids loading all raw rows into Node.js heap.
    const rows = await this.prisma.$queryRaw<DayAggRow[]>`
      SELECT
        "visitorId",
        "sessionId",
        "eventType",
        "path",
        "referrer",
        "device",
        "browser",
        "os",
        "country",
        "city",
        MIN("createdAt") AS "minAt",
        MAX("createdAt") AS "maxAt",
        COUNT(*)::bigint AS "eventCount",
        COUNT(*) FILTER (WHERE "eventType" = 'pageview')::bigint AS "pageviewCount"
      FROM "tracking_event"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      GROUP BY "visitorId", "sessionId", "eventType", "path", "referrer",
               "device", "browser", "os", "country", "city"
    `;

    // Compute derived metrics in JS on the much smaller grouped result set.
    const visitors = new Set<string>();
    const sessions = new Map<string, { start: Date; end: Date; pageviews: number }>();
    let pageviews = 0;

    const paths: Record<string, number> = {};
    const referrers: Record<string, number> = {};
    const countries: Record<string, number> = {};
    const cities = new Map<string, { city: string; country: string; count: number }>();
    const eventTypes: Record<string, number> = {};
    const devices: Record<string, number> = {};
    const browsers: Record<string, number> = {};
    const oss: Record<string, number> = {};

    for (const r of rows) {
      const eventCount = Number(r.eventCount);
      const pageviewCount = Number(r.pageviewCount);

      visitors.add(r.visitorId);
      eventTypes[r.eventType] = (eventTypes[r.eventType] ?? 0) + eventCount;

      const sess = sessions.get(r.sessionId);
      if (sess) {
        if (r.minAt < sess.start) sess.start = r.minAt;
        if (r.maxAt > sess.end) sess.end = r.maxAt;
        sess.pageviews += pageviewCount;
      } else {
        sessions.set(r.sessionId, { start: r.minAt, end: r.maxAt, pageviews: pageviewCount });
      }

      pageviews += pageviewCount;
      if (pageviewCount > 0) {
        if (r.path) paths[r.path] = (paths[r.path] ?? 0) + pageviewCount;
        const refKey = r.referrer ?? DIRECT_REFERRER_KEY;
        referrers[refKey] = (referrers[refKey] ?? 0) + pageviewCount;
      }

      if (r.country) countries[r.country] = (countries[r.country] ?? 0) + eventCount;
      if (r.city && r.country) {
        const cityKey = `${r.country}|${r.city}`;
        const existing = cities.get(cityKey);
        if (existing) existing.count += eventCount;
        else cities.set(cityKey, { city: r.city, country: r.country, count: eventCount });
      }
      if (r.device) devices[r.device] = (devices[r.device] ?? 0) + eventCount;
      if (r.browser) browsers[r.browser] = (browsers[r.browser] ?? 0) + eventCount;
      if (r.os) oss[r.os] = (oss[r.os] ?? 0) + eventCount;
    }

    let totalSessionSec = 0;
    let bounces = 0;
    for (const s of sessions.values()) {
      totalSessionSec += Math.round((s.end.getTime() - s.start.getTime()) / 1000);
      if (s.pageviews <= 1) bounces += 1;
    }
    const avgSessionSec = sessions.size > 0 ? Math.round(totalSessionSec / sessions.size) : 0;
    const bounceRate = sessions.size > 0 ? bounces / sessions.size : 0;

    const topCities = toTopCities(cities, 100);
    const stats = {
      uniqueVisitors: visitors.size,
      sessions: sessions.size,
      pageviews,
      totalEvents,
      avgSessionSec,
      bounceRate,
      topPaths: toTop(paths, 20),
      topReferrers: toTop(referrers, 20),
      topCountries: toTop(countries, 50),
      topCities,
      topEventTypes: eventTypes,
      deviceBreakdown: devices,
      browserBreakdown: browsers,
      osBreakdown: oss,
    };

    await this.prisma.trackingDailyStats.upsert({
      where: { date: from },
      create: { date: from, ...stats },
      update: stats,
    });
  }
}

const toTop = (counter: Record<string, number>, limit: number): TopItem[] =>
  Object.entries(counter)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

const toTopCities = (counter: Map<string, { city: string; country: string; count: number }>, limit: number): TopCityItem[] =>
  Array.from(counter.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((c) => ({ key: c.city, country: c.country, count: c.count }));

const startOfUtcDay = (d: Date): Date => {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
};
