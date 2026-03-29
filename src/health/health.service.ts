import { Injectable } from "@nestjs/common";
import { ObservabilityService } from "src/common/observability/observability.service";
import { PrismaService } from "src/prisma.service";
import { RedisService } from "src/redis/redis.service";

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly observability: ObservabilityService,
  ) {}

  getLiveness() {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  async getReadiness() {
    let db = false;
    let redis = false;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      db = false;
    }

    try {
      const pong = await this.redis.ping();
      redis = pong === "PONG";
    } catch {
      redis = false;
    }

    return {
      status: db && redis ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      checks: { db, redis },
    };
  }

  getMetrics() {
    const mem = process.memoryUsage();
    return {
      timestamp: new Date().toISOString(),
      process: {
        uptimeSeconds: Math.floor(process.uptime()),
        memory: {
          rssBytes: mem.rss,
          heapUsedBytes: mem.heapUsed,
          heapTotalBytes: mem.heapTotal,
        },
      },
      http: this.observability.snapshot(),
    };
  }
}
