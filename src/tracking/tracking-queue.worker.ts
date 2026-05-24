import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { PrismaService } from "src/prisma.service";
import { TrackingService } from "./tracking.service";

const BATCH_SIZE = 500;
const FLUSH_EVERY_MS = 10_000;

@Injectable()
export class TrackingQueueWorker implements OnModuleDestroy {
  private readonly logger = new Logger(TrackingQueueWorker.name);
  private flushing = false;
  private stopped = false;

  constructor(
    private readonly tracking: TrackingService,
    private readonly prisma: PrismaService,
  ) {}

  @Interval("tracking-flush", FLUSH_EVERY_MS)
  async handleInterval(): Promise<void> {
    if (this.stopped) return;
    await this.flushOnce();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    await this.flushOnce();
  }

  private async flushOnce(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      for (;;) {
        const events = await this.tracking.drainQueue(BATCH_SIZE);
        if (events.length === 0) break;

        try {
          await this.prisma.trackingEvent.createMany({
            data: events.map((e) => ({
              visitorId: e.visitorId,
              sessionId: e.sessionId,
              userId: e.userId,
              eventType: e.eventType,
              path: e.path,
              referrer: e.referrer,
              device: e.device,
              browser: e.browser,
              os: e.os,
              country: e.country ?? null,
              city: e.city ?? null,
              metadata: (e.metadata ?? undefined) as object | undefined,
              createdAt: new Date(e.createdAt),
            })),
          });
        } catch (err) {
          this.logger.error(
            `failed to persist ${events.length} events: ${(err as Error).message}`,
          );
        }

        if (events.length < BATCH_SIZE) break;
      }
    } finally {
      this.flushing = false;
    }
  }
}
