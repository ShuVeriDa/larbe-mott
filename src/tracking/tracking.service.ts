import { createHash, randomBytes, randomUUID } from "crypto";
import { Injectable, Logger } from "@nestjs/common";
import { UAParser } from "ua-parser-js";
import { RedisService } from "src/redis/redis.service";
import { GeoIpService } from "./geoip.service";

const QUEUE_KEY = "tracking:events:queue";
const SALT_KEY = "tracking:visitor-salt";
const SALT_TTL_SEC = 26 * 60 * 60;
const SESSION_GAP_SEC = 30 * 60;
const REALTIME_KEY = "tracking:realtime";
const REALTIME_WINDOW_SEC = 5 * 60;
const QUEUE_MAX_LEN = 100_000;
const AGGREGATOR_LAST_RUN_KEY = "tracking:aggregator:last-run";
const AGGREGATOR_LAST_RUN_TTL_SEC = 48 * 60 * 60;

export interface RawEvent {
  type: string;
  path?: string;
  referrer?: string;
  metadata?: Record<string, unknown>;
  ip: string;
  userAgent?: string;
  userId?: string;
}

export interface QueuedEvent {
  visitorId: string;
  sessionId: string;
  userId: string | null;
  eventType: string;
  path: string | null;
  referrer: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  city: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  // In-memory salt cache: avoids a Redis GET on every track() call.
  // Keyed by UTC date string (YYYY-MM-DD) so it auto-rotates at midnight.
  private saltCache: { date: string; value: string } | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly geoip: GeoIpService,
  ) {}

  async track(raw: RawEvent): Promise<void> {
    try {
      const salt = await this.getDailySalt();
      const visitorId = computeVisitorId(raw.ip, raw.userAgent, salt);

      const [sessionId, ua, geo] = await Promise.all([
        this.getSessionId(visitorId),
        Promise.resolve(parseUserAgent(raw.userAgent)),
        Promise.resolve(this.geoip.lookup(raw.ip)),
      ]);

      const now = Date.now();
      const event: QueuedEvent = {
        visitorId,
        sessionId,
        userId: raw.userId ?? null,
        eventType: raw.type,
        path: raw.path ?? null,
        referrer: normalizeReferrer(raw.referrer),
        device: ua.device,
        browser: ua.browser,
        os: ua.os,
        country: geo.country,
        city: geo.city,
        metadata: raw.metadata ?? null,
        createdAt: new Date(now).toISOString(),
      };

      const pipe = this.redis.pipeline();
      pipe.lpush(QUEUE_KEY, JSON.stringify(event));
      pipe.ltrim(QUEUE_KEY, 0, QUEUE_MAX_LEN - 1);
      pipe.zadd(REALTIME_KEY, now, visitorId);
      pipe.zremrangebyscore(REALTIME_KEY, 0, now - REALTIME_WINDOW_SEC * 1000);
      pipe.expire(REALTIME_KEY, REALTIME_WINDOW_SEC * 2);
      await pipe.exec();
    } catch (err) {
      this.logger.warn(
        `track failed: ${(err as Error).message} — event dropped`,
      );
    }
  }

  async getRealtimeVisitors(): Promise<number> {
    try {
      await this.redis.zremrangebyscore(
        REALTIME_KEY,
        0,
        Date.now() - REALTIME_WINDOW_SEC * 1000,
      );
      return await this.redis.zcard(REALTIME_KEY);
    } catch {
      return 0;
    }
  }

  async drainQueue(batchSize: number): Promise<QueuedEvent[]> {
    const items: QueuedEvent[] = [];
    try {
      // RPOP key count — single command instead of N pipelined RPOPs.
      const raw = await (this.redis as unknown as {
        rpop(key: string, count: number): Promise<string[] | null>;
      }).rpop(QUEUE_KEY, batchSize);

      if (!raw) return items;
      for (const entry of raw) {
        try {
          items.push(JSON.parse(entry) as QueuedEvent);
        } catch {
          // corrupted entry — skip
        }
      }
    } catch {
      // Fallback: ioredis client may not support RPOP count on older Redis.
      // In that case drain via pipeline as before.
      try {
        const pipe = this.redis.pipeline();
        for (let i = 0; i < batchSize; i++) pipe.rpop(QUEUE_KEY);
        const results = (await pipe.exec()) ?? [];
        for (const [err, raw] of results) {
          if (err || !raw) continue;
          try {
            items.push(JSON.parse(raw as string) as QueuedEvent);
          } catch {
            // corrupted entry — skip
          }
        }
      } catch (err) {
        this.logger.warn(`drainQueue failed: ${(err as Error).message}`);
      }
    }
    return items;
  }

  async queueSize(): Promise<number> {
    try {
      return await this.redis.llen(QUEUE_KEY);
    } catch {
      return 0;
    }
  }

  async getAggregatorLastRun(): Promise<string | null> {
    try {
      return await this.redis.get(AGGREGATOR_LAST_RUN_KEY);
    } catch {
      return null;
    }
  }

  async setAggregatorLastRun(): Promise<void> {
    try {
      await this.redis.set(
        AGGREGATOR_LAST_RUN_KEY,
        new Date().toISOString(),
        "EX",
        AGGREGATOR_LAST_RUN_TTL_SEC,
      );
    } catch (err) {
      this.logger.warn(
        `setAggregatorLastRun failed: ${(err as Error).message}`,
      );
    }
  }

  private async getDailySalt(): Promise<string> {
    const today = new Date().toISOString().slice(0, 10);
    if (this.saltCache?.date === today) return this.saltCache.value;

    const cached = await this.redis.get(SALT_KEY);
    if (cached) {
      this.saltCache = { date: today, value: cached };
      return cached;
    }

    const salt = randomBytes(32).toString("hex");
    const ok = await this.redis.set(SALT_KEY, salt, "EX", SALT_TTL_SEC, "NX");
    const final = ok === "OK" ? salt : ((await this.redis.get(SALT_KEY)) ?? salt);
    this.saltCache = { date: today, value: final };
    return final;
  }

  private async getSessionId(visitorId: string): Promise<string> {
    const key = `tracking:session:${visitorId}`;
    const existing = await this.redis.get(key);
    if (existing) {
      // Fire-and-forget the expire refresh — don't await to stay off hot path.
      void this.redis.expire(key, SESSION_GAP_SEC);
      return existing;
    }
    const fresh = randomUUID();
    await this.redis.set(key, fresh, "EX", SESSION_GAP_SEC);
    return fresh;
  }
}

const computeVisitorId = (
  ip: string,
  userAgent: string | undefined,
  salt: string,
): string =>
  createHash("sha256")
    .update(`${ip}::${userAgent ?? ""}::${salt}`)
    .digest("hex")
    .slice(0, 32);

const parseUserAgent = (ua: string | undefined) => {
  if (!ua) return { device: null, browser: null, os: null };
  const parser = new UAParser(ua);
  const r = parser.getResult();
  const device =
    r.device.type ??
    (/bot|crawler|spider|curl|wget|postman/i.test(ua) ? "bot" : "desktop");
  return {
    device,
    browser: r.browser.name ?? null,
    os: r.os.name ?? null,
  };
};

const normalizeReferrer = (ref: string | undefined): string | null => {
  if (!ref) return null;
  try {
    const host = new URL(ref).hostname;
    return host || null;
  } catch {
    return null;
  }
};
