import { Injectable } from "@nestjs/common";
import { Prisma, UserEventType } from "@prisma/client";
import { PrismaService } from "src/prisma.service";

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getComplexTexts(opts: {
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  }) {
    const where: Prisma.UserEventWhereInput = {
      type: UserEventType.FAIL_LOOKUP,
      ...(opts.dateFrom || opts.dateTo
        ? {
            createdAt: {
              ...(opts.dateFrom ? { gte: new Date(opts.dateFrom) } : {}),
              ...(opts.dateTo ? { lte: new Date(opts.dateTo) } : {}),
            },
          }
        : {}),
    };

    const events = await this.prisma.userEvent.findMany({
      where,
      select: { metadata: true },
    });

    const counts = new Map<string, number>();
    for (const e of events) {
      const md = e.metadata as any;
      const textId = md?.textId;
      if (!textId) continue;
      counts.set(textId, (counts.get(textId) ?? 0) + 1);
    }

    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.min(200, Math.max(1, opts.limit ?? 50)));

    return sorted.map(([textId, failLookupCount]) => ({ textId, failLookupCount }));
  }

  async getPopularLevels(opts: { dateFrom?: string; dateTo?: string }) {
    const where: Prisma.UserEventWhereInput = {
      type: UserEventType.OPEN_TEXT,
      ...(opts.dateFrom || opts.dateTo
        ? {
            createdAt: {
              ...(opts.dateFrom ? { gte: new Date(opts.dateFrom) } : {}),
              ...(opts.dateTo ? { lte: new Date(opts.dateTo) } : {}),
            },
          }
        : {}),
    };

    const events = await this.prisma.userEvent.findMany({
      where,
      select: { metadata: true },
    });

    const textIdCounts = new Map<string, number>();
    for (const e of events) {
      const md = e.metadata as any;
      const textId = md?.textId;
      if (!textId) continue;
      textIdCounts.set(textId, (textIdCounts.get(textId) ?? 0) + 1);
    }

    const textIds = Array.from(textIdCounts.keys());
    if (!textIds.length) return [];

    const texts = await this.prisma.text.findMany({
      where: { id: { in: textIds } },
      select: { id: true, level: true },
    });

    const levelCounts = new Map<string, number>();
    for (const t of texts) {
      if (!t.level) continue;
      const opens = textIdCounts.get(t.id) ?? 0;
      levelCounts.set(t.level, (levelCounts.get(t.level) ?? 0) + opens);
    }

    return Array.from(levelCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([level, openCount]) => ({ level, openCount }));
  }
}

