import { Injectable } from "@nestjs/common";
import {
  LogLevel,
  PaymentStatus,
  Prisma,
  SubscriptionEventType,
  UserEventType,
} from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import {
  AdminLogsExportFormat,
  AdminLogsLevel,
  AdminLogsRange,
  AdminLogsTab,
  FetchAdminLogsDto,
} from "./dto/fetch-admin-logs.dto";

interface PeriodBounds {
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
}

interface LogListItem {
  id: string;
  timestamp: string;
  level: AdminLogsLevel;
  service: string;
  message: string;
  tracePreview: string | null;
  durationMs: number | null;
  traceId: string;
}

interface UnifiedLogEvent {
  id: string;
  source: "textVersionLog" | "userEvent" | "subscriptionEvent" | "payment";
  sourceId: string;
  timestamp: Date;
  level: AdminLogsLevel;
  service: string;
  message: string;
  tracePreview: string | null;
  durationMs: number | null;
  traceId: string;
  userId: string | null;
  host: string | null;
  stack: string | null;
  context: Record<string, unknown>;
}

interface LevelCounters {
  total: number;
  debug: number;
  info: number;
  warn: number;
  error: number;
  critical: number;
  tabs: {
    all: number;
    debug: number;
    info: number;
    warn: number;
    error: number;
    critical: number;
  };
}

@Injectable()
export class AdminLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async getLogs(query: FetchAdminLogsDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    const skip = (page - 1) * limit;
    const tabOrLevel = this.resolveLevelFilter(query);

    const bounds = this.resolvePeriod(query);
    const counters = await this.countLevels(query, bounds);
    const candidateTake = Math.min(5000, page * limit + 100);
    const events = await this.fetchUnifiedEvents(query, bounds, candidateTake);
    const filtered = this.applyInMemoryFilters(events, query, tabOrLevel);
    const sorted = this.sortEvents(filtered, query.order ?? "desc");
    const pageItems = sorted.slice(skip, skip + limit).map((item) => this.toListItem(item));

    return {
      items: pageItems,
      total: counters.total,
      page,
      limit,
      skip,
      tabs: counters.tabs,
    };
  }

  async getStats(query: FetchAdminLogsDto) {
    const statsQuery: FetchAdminLogsDto = {
      ...query,
      level: undefined,
      tab: AdminLogsTab.ALL,
    };
    const bounds = this.resolvePeriod(query);
    const [currentCounts, prevCounts, avgNow, avgPrev] = await Promise.all([
      this.countLevels(statsQuery, {
        from: bounds.from,
        to: bounds.to,
        prevFrom: bounds.prevFrom,
        prevTo: bounds.prevTo,
      }),
      this.countLevels(statsQuery, {
        from: bounds.prevFrom,
        to: bounds.prevTo,
        prevFrom: bounds.prevFrom,
        prevTo: bounds.prevTo,
      }),
      this.prisma.textProcessingVersion.aggregate({
        where: { createdAt: { gte: bounds.from, lte: bounds.to }, durationMs: { not: null } },
        _avg: { durationMs: true },
      }),
      this.prisma.textProcessingVersion.aggregate({
        where: {
          createdAt: { gte: bounds.prevFrom, lte: bounds.prevTo },
          durationMs: { not: null },
        },
        _avg: { durationMs: true },
      }),
    ]);

    const totalEvents24h = currentCounts.total;
    const errors24h = currentCounts.error + currentCounts.critical;
    const warnings24h = currentCounts.warn;
    const avgResponseMs = Math.round(avgNow._avg.durationMs ?? 0);
    const errorRatePct =
      totalEvents24h > 0 ? Number(((errors24h / totalEvents24h) * 100).toFixed(1)) : 0;

    const prevTotal = prevCounts.total;
    const prevErrors = prevCounts.error + prevCounts.critical;
    const prevWarnings = prevCounts.warn;
    const prevAvg = Math.round(avgPrev._avg.durationMs ?? 0);
    const prevErrorRatePct =
      prevTotal > 0 ? Number(((prevErrors / prevTotal) * 100).toFixed(1)) : 0;

    return {
      totalEvents24h: {
        value: totalEvents24h,
        trend: this.percentTrend(totalEvents24h, prevTotal),
      },
      errors24h: {
        value: errors24h,
        trend: this.percentTrend(errors24h, prevErrors),
      },
      warnings24h: {
        value: warnings24h,
        trend: this.percentTrend(warnings24h, prevWarnings),
      },
      avgResponseMs: {
        value: avgResponseMs,
        trend: this.absoluteTrend(avgResponseMs, prevAvg),
      },
      errorRatePct: {
        value: errorRatePct,
        trend: this.ppTrend(errorRatePct, prevErrorRatePct),
      },
      tabs: {
        all: currentCounts.total,
        debug: currentCounts.debug,
        info: currentCounts.info,
        warn: currentCounts.warn,
        error: currentCounts.error,
        critical: currentCounts.critical,
      },
    };
  }

  async getById(id: string) {
    const [source, sourceId] = this.parseUnifiedId(id);
    if (!source || !sourceId) return null;
    const event = await this.fetchBySourceId(source, sourceId);
    if (!event) return null;

    return {
      id: event.id,
      title: `${event.service}: ${this.truncate(event.message, 70)}`,
      level: event.level,
      levelLabel: this.levelLabel(event.level),
      timestamp: event.timestamp.toISOString(),
      service: event.service,
      message: event.message,
      durationMs: event.durationMs,
      traceId: event.traceId,
      user: event.userId ? { id: event.userId } : null,
      host: event.host,
      stack: event.stack,
      context: event.context,
    };
  }

  async getLive(query: FetchAdminLogsDto) {
    const liveLimit = Math.min(200, Math.max(1, query.liveLimit ?? 50));
    const since = query.since ? new Date(query.since) : null;
    const tabOrLevel = this.resolveLevelFilter(query);

    const bounds = this.resolvePeriod(query);
    const from = since && !Number.isNaN(since.getTime()) ? since : bounds.from;
    const events = await this.fetchUnifiedEvents(
      { ...query, dateFrom: from.toISOString(), dateTo: bounds.to.toISOString() },
      { from, to: bounds.to },
      liveLimit * 2,
    );
    const filtered = this.applyInMemoryFilters(events, query, tabOrLevel);
    const sorted = this.sortEvents(filtered, "asc");
    const sliced = sorted.slice(0, liveLimit).map((item) => this.toListItem(item));

    return {
      items: sliced,
      nextCursor: sliced.length ? sliced[sliced.length - 1].timestamp : query.since ?? null,
    };
  }

  async exportLogs(query: FetchAdminLogsDto, format: AdminLogsExportFormat) {
    const payload = await this.getLogs({ ...query, page: 1, limit: 1000 });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const baseName = `admin-logs-${stamp}`;

    if (format === AdminLogsExportFormat.CSV) {
      return {
        format,
        fileName: `${baseName}.csv`,
        content: this.toCsv(payload.items),
      };
    }

    return {
      format: AdminLogsExportFormat.JSON,
      fileName: `${baseName}.json`,
      content: JSON.stringify(payload, null, 2),
    };
  }

  private resolvePeriod(query: FetchAdminLogsDto): PeriodBounds {
    const now = new Date();
    const dateFrom = this.parseDate(query.dateFrom);
    const dateTo = this.parseDate(query.dateTo);

    let from: Date;
    let to: Date;

    if (dateFrom && dateTo) {
      from = dateFrom;
      to = dateTo;
    } else {
      to = now;
      switch (query.range ?? AdminLogsRange.LAST_24_HOURS) {
        case AdminLogsRange.LAST_15_MIN:
          from = new Date(now.getTime() - 15 * 60_000);
          break;
        case AdminLogsRange.LAST_1_HOUR:
          from = new Date(now.getTime() - 3_600_000);
          break;
        case AdminLogsRange.LAST_7_DAYS:
          from = new Date(now.getTime() - 7 * 86_400_000);
          break;
        case AdminLogsRange.LAST_30_DAYS:
          from = new Date(now.getTime() - 30 * 86_400_000);
          break;
        case AdminLogsRange.ALL:
          from = new Date(2020, 0, 1);
          break;
        case AdminLogsRange.LAST_24_HOURS:
        default:
          from = new Date(now.getTime() - 24 * 3_600_000);
          break;
      }
    }

    if (from > to) {
      const temp = from;
      from = to;
      to = temp;
    }

    const duration = to.getTime() - from.getTime();
    return {
      from,
      to,
      prevFrom: new Date(from.getTime() - duration),
      prevTo: new Date(from),
    };
  }

  private async fetchUnifiedEvents(
    query: FetchAdminLogsDto,
    bounds: Pick<PeriodBounds, "from" | "to">,
    take: number,
  ): Promise<UnifiedLogEvent[]> {
    const service = query.service ?? "all";
    const tasks: Array<Promise<UnifiedLogEvent[]>> = [];

    if (service === "all" || service === "text-processor" || service === "scheduler") {
      tasks.push(this.fetchTextVersionLogs(query, bounds, take));
    }
    if (
      service === "all" ||
      service === "api-gateway" ||
      service === "auth-service" ||
      service === "dictionary" ||
      service === "worker"
    ) {
      tasks.push(this.fetchUserEventLogs(query, bounds, take));
    }
    if (service === "all" || service === "billing") {
      tasks.push(this.fetchSubscriptionEvents(query, bounds, take));
      tasks.push(this.fetchPaymentEvents(query, bounds, take));
    }

    const result = await Promise.all(tasks);
    return result.flat();
  }

  private async fetchTextVersionLogs(
    query: FetchAdminLogsDto,
    bounds: Pick<PeriodBounds, "from" | "to">,
    take: number,
  ): Promise<UnifiedLogEvent[]> {
    const where: Prisma.TextVersionLogWhereInput = {
      timestamp: { gte: bounds.from, lte: bounds.to },
    };

    const dbLevels = this.textLevelsForFilter(query);
    if (dbLevels) where.level = { in: dbLevels };

    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { id: { contains: q, mode: "insensitive" } },
        { message: { contains: q, mode: "insensitive" } },
        { versionId: { contains: q, mode: "insensitive" } },
        { version: { text: { title: { contains: q, mode: "insensitive" } } } },
      ];
    }

    const rows = await this.prisma.textVersionLog.findMany({
      where,
      take,
      orderBy: { timestamp: query.order === "asc" ? "asc" : "desc" },
      select: {
        id: true,
        timestamp: true,
        level: true,
        message: true,
        version: {
          select: {
            id: true,
            trigger: true,
            status: true,
            durationMs: true,
            errorMessage: true,
            textId: true,
            text: { select: { title: true } },
            initiatorId: true,
          },
        },
      },
    });

    return rows.map((row) => {
      const isCritical = this.isCriticalTextLog(
        row.message,
        row.version.errorMessage,
        row.version.durationMs,
      );
      const service = row.version.trigger === "MANUAL" ? "text-processor" : "scheduler";
      const level = this.mapTextLogLevel(row.level, isCritical);

      return {
        id: this.toUnifiedId("textVersionLog", row.id),
        source: "textVersionLog",
        sourceId: row.id,
        timestamp: row.timestamp,
        level,
        service,
        message: row.message,
        tracePreview: row.version.errorMessage ?? `text="${row.version.text.title}"`,
        durationMs: row.version.durationMs,
        traceId: row.id,
        userId: row.version.initiatorId,
        host: null,
        stack: row.version.errorMessage,
        context: {
          versionId: row.version.id,
          textId: row.version.textId,
          textTitle: row.version.text.title,
          trigger: row.version.trigger,
          status: row.version.status,
        },
      };
    });
  }

  private async fetchUserEventLogs(
    query: FetchAdminLogsDto,
    bounds: Pick<PeriodBounds, "from" | "to">,
    take: number,
  ): Promise<UnifiedLogEvent[]> {
    const where: Prisma.UserEventWhereInput = {
      createdAt: { gte: bounds.from, lte: bounds.to },
    };
    const types = this.userEventTypesForService(query.service);
    if (types) where.type = { in: types };

    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { id: { contains: q, mode: "insensitive" } },
        { userId: { contains: q, mode: "insensitive" } },
      ];
    }

    const rows = await this.prisma.userEvent.findMany({
      where,
      take,
      orderBy: { createdAt: query.order === "asc" ? "asc" : "desc" },
      select: { id: true, createdAt: true, type: true, userId: true, metadata: true },
    });

    return rows.map((row) => {
      const metadata = this.jsonObject(row.metadata);
      const service = this.userEventService(row.type);
      const level = this.userEventLevel(row.type);
      const durationMs = this.readDurationMs(metadata);

      return {
        id: this.toUnifiedId("userEvent", row.id),
        source: "userEvent",
        sourceId: row.id,
        timestamp: row.createdAt,
        level,
        service,
        message: this.userEventMessage(row.type, metadata),
        tracePreview: this.userEventTracePreview(row.type, metadata),
        durationMs,
        traceId: row.id,
        userId: row.userId,
        host: null,
        stack: null,
        context: metadata,
      };
    });
  }

  private async fetchSubscriptionEvents(
    query: FetchAdminLogsDto,
    bounds: Pick<PeriodBounds, "from" | "to">,
    take: number,
  ): Promise<UnifiedLogEvent[]> {
    const where: Prisma.SubscriptionEventWhereInput = {
      createdAt: { gte: bounds.from, lte: bounds.to },
    };
    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { id: { contains: q, mode: "insensitive" } },
        { subscriptionId: { contains: q, mode: "insensitive" } },
      ];
    }

    const rows = await this.prisma.subscriptionEvent.findMany({
      where,
      take,
      orderBy: { createdAt: query.order === "asc" ? "asc" : "desc" },
      select: {
        id: true,
        subscriptionId: true,
        type: true,
        metadata: true,
        createdAt: true,
        subscription: { select: { userId: true } },
      },
    });

    return rows.map((row) => {
      const metadata = this.jsonObject(row.metadata);
      return {
        id: this.toUnifiedId("subscriptionEvent", row.id),
        source: "subscriptionEvent",
        sourceId: row.id,
        timestamp: row.createdAt,
        level: this.subscriptionEventLevel(row.type),
        service: "billing",
        message: `Subscription ${row.type.toLowerCase()}`,
        tracePreview: `subscription=${row.subscriptionId}`,
        durationMs: null,
        traceId: row.id,
        userId: row.subscription.userId,
        host: null,
        stack: null,
        context: { subscriptionId: row.subscriptionId, ...metadata },
      };
    });
  }

  private async fetchPaymentEvents(
    query: FetchAdminLogsDto,
    bounds: Pick<PeriodBounds, "from" | "to">,
    take: number,
  ): Promise<UnifiedLogEvent[]> {
    const where: Prisma.PaymentWhereInput = {
      createdAt: { gte: bounds.from, lte: bounds.to },
    };
    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { id: { contains: q, mode: "insensitive" } },
        { providerPaymentId: { contains: q, mode: "insensitive" } },
      ];
    }

    const rows = await this.prisma.payment.findMany({
      where,
      take,
      orderBy: { createdAt: query.order === "asc" ? "asc" : "desc" },
      select: {
        id: true,
        userId: true,
        status: true,
        amountCents: true,
        currency: true,
        provider: true,
        providerPaymentId: true,
        createdAt: true,
      },
    });

    return rows.map((row) => ({
      id: this.toUnifiedId("payment", row.id),
      source: "payment",
      sourceId: row.id,
      timestamp: row.createdAt,
      level: this.paymentLevel(row.status),
      service: "billing",
      message: `Payment ${row.status.toLowerCase()} (${(row.amountCents / 100).toFixed(2)} ${
        row.currency
      })`,
      tracePreview: `${row.provider}${row.providerPaymentId ? `:${row.providerPaymentId}` : ""}`,
      durationMs: null,
      traceId: row.id,
      userId: row.userId,
      host: null,
      stack: null,
      context: {
        provider: row.provider,
        providerPaymentId: row.providerPaymentId,
        amountCents: row.amountCents,
        currency: row.currency,
      },
    }));
  }

  private applyInMemoryFilters(
    items: UnifiedLogEvent[],
    query: FetchAdminLogsDto,
    level?: AdminLogsLevel,
  ): UnifiedLogEvent[] {
    const q = query.q?.trim().toLowerCase();
    return items.filter((item) => {
      if (query.service && query.service !== "all" && item.service !== query.service) {
        return false;
      }
      if (level && item.level !== level) {
        return false;
      }
      if (!q) return true;

      const haystack = [
        item.id,
        item.sourceId,
        item.message,
        item.traceId,
        item.tracePreview ?? "",
        JSON.stringify(item.context),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  private sortEvents(items: UnifiedLogEvent[], order: "asc" | "desc"): UnifiedLogEvent[] {
    const sorted = [...items].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return order === "asc" ? sorted : sorted.reverse();
  }

  private toListItem(item: UnifiedLogEvent): LogListItem {
    return {
      id: item.id,
      timestamp: item.timestamp.toISOString(),
      level: item.level,
      service: item.service,
      message: item.message,
      tracePreview: item.tracePreview,
      durationMs: item.durationMs,
      traceId: item.traceId,
    };
  }

  private async countLevels(
    query: FetchAdminLogsDto,
    bounds: Pick<PeriodBounds, "from" | "to" | "prevFrom" | "prevTo">,
  ): Promise<LevelCounters> {
    const sample = await this.fetchUnifiedEvents(query, bounds, 8000);
    const filtered = this.applyInMemoryFilters(sample, query);

    const counters: LevelCounters = {
      total: filtered.length,
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
      critical: 0,
      tabs: { all: filtered.length, debug: 0, info: 0, warn: 0, error: 0, critical: 0 },
    };
    for (const item of filtered) {
      if (item.level === AdminLogsLevel.DEBUG) counters.debug += 1;
      if (item.level === AdminLogsLevel.INFO) counters.info += 1;
      if (item.level === AdminLogsLevel.WARN) counters.warn += 1;
      if (item.level === AdminLogsLevel.ERROR) counters.error += 1;
      if (item.level === AdminLogsLevel.CRITICAL) counters.critical += 1;
    }
    counters.tabs.debug = counters.debug;
    counters.tabs.info = counters.info;
    counters.tabs.warn = counters.warn;
    counters.tabs.error = counters.error;
    counters.tabs.critical = counters.critical;
    return counters;
  }

  private resolveLevelFilter(query: FetchAdminLogsDto): AdminLogsLevel | undefined {
    if (query.tab && query.tab !== AdminLogsTab.ALL) {
      if (query.tab === AdminLogsTab.DEBUG) return AdminLogsLevel.DEBUG;
      if (query.tab === AdminLogsTab.INFO) return AdminLogsLevel.INFO;
      if (query.tab === AdminLogsTab.WARN) return AdminLogsLevel.WARN;
      if (query.tab === AdminLogsTab.ERROR) return AdminLogsLevel.ERROR;
      if (query.tab === AdminLogsTab.CRITICAL) return AdminLogsLevel.CRITICAL;
    }
    return query.level;
  }

  private textLevelsForFilter(query: FetchAdminLogsDto): LogLevel[] | null {
    const level = this.resolveLevelFilter(query);
    if (!level) return null;
    if (level === AdminLogsLevel.DEBUG) return [LogLevel.OK];
    if (level === AdminLogsLevel.INFO) return [LogLevel.INFO];
    if (level === AdminLogsLevel.WARN) return [LogLevel.WARN];
    return [LogLevel.ERROR];
  }

  private mapTextLogLevel(level: LogLevel, isCritical: boolean): AdminLogsLevel {
    if (level === LogLevel.OK) return AdminLogsLevel.DEBUG;
    if (level === LogLevel.INFO) return AdminLogsLevel.INFO;
    if (level === LogLevel.WARN) return AdminLogsLevel.WARN;
    return isCritical ? AdminLogsLevel.CRITICAL : AdminLogsLevel.ERROR;
  }

  private isCriticalTextLog(
    message: string,
    errorMessage: string | null,
    durationMs: number | null,
  ): boolean {
    const text = `${message} ${errorMessage ?? ""}`.toLowerCase();
    if ((durationMs ?? 0) >= 5000) return true;
    return /(timeout|overflow|unreachable|fatal|panic)/i.test(text);
  }

  private levelLabel(level: AdminLogsLevel): string {
    switch (level) {
      case AdminLogsLevel.DEBUG:
        return "Debug";
      case AdminLogsLevel.INFO:
        return "Info";
      case AdminLogsLevel.WARN:
        return "Warning";
      case AdminLogsLevel.ERROR:
        return "Error";
      case AdminLogsLevel.CRITICAL:
      default:
        return "Critical";
    }
  }

  private userEventService(type: UserEventType): string {
    if (type === UserEventType.START_SESSION) return "auth-service";
    if (type === UserEventType.ADD_TO_DICTIONARY) return "dictionary";
    if (type === UserEventType.REVIEW_SESSION) return "worker";
    return "api-gateway";
  }

  private userEventLevel(type: UserEventType): AdminLogsLevel {
    if (type === UserEventType.CLICK_WORD) return AdminLogsLevel.DEBUG;
    if (type === UserEventType.FAIL_LOOKUP) return AdminLogsLevel.WARN;
    return AdminLogsLevel.INFO;
  }

  private userEventMessage(type: UserEventType, metadata: Record<string, unknown>): string {
    const path = this.readString(metadata, "path");
    if (type === UserEventType.OPEN_TEXT) {
      const textId = this.readString(metadata, "textId");
      return `OPEN_TEXT${textId ? ` text_id=${textId}` : ""}`;
    }
    if (type === UserEventType.ADD_TO_DICTIONARY) return "ADD_TO_DICTIONARY";
    if (type === UserEventType.FAIL_LOOKUP) return "FAIL_LOOKUP";
    if (type === UserEventType.START_SESSION) return "START_SESSION";
    if (type === UserEventType.CLICK_WORD) return "CLICK_WORD";
    if (type === UserEventType.READ_SESSION) return `READ_SESSION${path ? ` ${path}` : ""}`;
    return type;
  }

  private userEventTracePreview(type: UserEventType, metadata: Record<string, unknown>) {
    if (type === UserEventType.FAIL_LOOKUP) {
      const normalized = this.readString(metadata, "normalized");
      if (normalized) return `normalized=${normalized}`;
    }
    const path = this.readString(metadata, "path");
    if (path) return path;
    return null;
  }

  private userEventTypesForService(service?: string): UserEventType[] | null {
    if (!service || service === "all") return null;
    if (service === "auth-service") return [UserEventType.START_SESSION];
    if (service === "dictionary") return [UserEventType.ADD_TO_DICTIONARY];
    if (service === "worker") return [UserEventType.REVIEW_SESSION];
    if (service === "api-gateway") {
      return [UserEventType.OPEN_TEXT, UserEventType.CLICK_WORD, UserEventType.READ_SESSION];
    }
    return [];
  }

  private paymentLevel(status: PaymentStatus): AdminLogsLevel {
    if (status === PaymentStatus.PENDING) return AdminLogsLevel.DEBUG;
    if (status === PaymentStatus.SUCCEEDED) return AdminLogsLevel.INFO;
    if (status === PaymentStatus.REFUNDED) return AdminLogsLevel.WARN;
    return AdminLogsLevel.ERROR;
  }

  private subscriptionEventLevel(type: SubscriptionEventType): AdminLogsLevel {
    if (type === SubscriptionEventType.CANCELED || type === SubscriptionEventType.REFUNDED) {
      return AdminLogsLevel.WARN;
    }
    return AdminLogsLevel.INFO;
  }

  private toUnifiedId(source: UnifiedLogEvent["source"], id: string): string {
    return `${source}__${id}`;
  }

  private parseUnifiedId(
    id: string,
  ): [UnifiedLogEvent["source"] | null, string | null] {
    const divider = id.indexOf("__");
    if (divider <= 0) return [null, null];
    const source = id.slice(0, divider);
    const sourceId = id.slice(divider + 2);
    if (
      source !== "textVersionLog" &&
      source !== "userEvent" &&
      source !== "subscriptionEvent" &&
      source !== "payment"
    ) {
      return [null, null];
    }
    return [source, sourceId];
  }

  private async fetchBySourceId(
    source: UnifiedLogEvent["source"],
    sourceId: string,
  ): Promise<UnifiedLogEvent | null> {
    if (source === "textVersionLog") {
      const row = await this.prisma.textVersionLog.findUnique({
        where: { id: sourceId },
        select: {
          id: true,
          timestamp: true,
          level: true,
          message: true,
          version: {
            select: {
              id: true,
              trigger: true,
              status: true,
              durationMs: true,
              errorMessage: true,
              textId: true,
              text: { select: { title: true } },
              initiatorId: true,
            },
          },
        },
      });
      if (!row) return null;
      const isCritical = this.isCriticalTextLog(
        row.message,
        row.version.errorMessage,
        row.version.durationMs,
      );
      return {
        id: this.toUnifiedId("textVersionLog", row.id),
        source: "textVersionLog",
        sourceId: row.id,
        timestamp: row.timestamp,
        level: this.mapTextLogLevel(row.level, isCritical),
        service: row.version.trigger === "MANUAL" ? "text-processor" : "scheduler",
        message: row.message,
        tracePreview: row.version.errorMessage ?? `text="${row.version.text.title}"`,
        durationMs: row.version.durationMs,
        traceId: row.id,
        userId: row.version.initiatorId,
        host: null,
        stack: row.version.errorMessage,
        context: {
          versionId: row.version.id,
          textId: row.version.textId,
          textTitle: row.version.text.title,
          trigger: row.version.trigger,
          status: row.version.status,
        },
      };
    }
    if (source === "userEvent") {
      const row = await this.prisma.userEvent.findUnique({
        where: { id: sourceId },
        select: { id: true, createdAt: true, type: true, userId: true, metadata: true },
      });
      if (!row) return null;
      const metadata = this.jsonObject(row.metadata);
      return {
        id: this.toUnifiedId("userEvent", row.id),
        source: "userEvent",
        sourceId: row.id,
        timestamp: row.createdAt,
        level: this.userEventLevel(row.type),
        service: this.userEventService(row.type),
        message: this.userEventMessage(row.type, metadata),
        tracePreview: this.userEventTracePreview(row.type, metadata),
        durationMs: this.readDurationMs(metadata),
        traceId: row.id,
        userId: row.userId,
        host: null,
        stack: null,
        context: metadata,
      };
    }
    if (source === "subscriptionEvent") {
      const row = await this.prisma.subscriptionEvent.findUnique({
        where: { id: sourceId },
        select: {
          id: true,
          subscriptionId: true,
          type: true,
          metadata: true,
          createdAt: true,
          subscription: { select: { userId: true } },
        },
      });
      if (!row) return null;
      const metadata = this.jsonObject(row.metadata);
      return {
        id: this.toUnifiedId("subscriptionEvent", row.id),
        source: "subscriptionEvent",
        sourceId: row.id,
        timestamp: row.createdAt,
        level: this.subscriptionEventLevel(row.type),
        service: "billing",
        message: `Subscription ${row.type.toLowerCase()}`,
        tracePreview: `subscription=${row.subscriptionId}`,
        durationMs: null,
        traceId: row.id,
        userId: row.subscription.userId,
        host: null,
        stack: null,
        context: { subscriptionId: row.subscriptionId, ...metadata },
      };
    }
    const row = await this.prisma.payment.findUnique({
      where: { id: sourceId },
      select: {
        id: true,
        userId: true,
        status: true,
        amountCents: true,
        currency: true,
        provider: true,
        providerPaymentId: true,
        createdAt: true,
      },
    });
    if (!row) return null;
    return {
      id: this.toUnifiedId("payment", row.id),
      source: "payment",
      sourceId: row.id,
      timestamp: row.createdAt,
      level: this.paymentLevel(row.status),
      service: "billing",
      message: `Payment ${row.status.toLowerCase()} (${(row.amountCents / 100).toFixed(2)} ${
        row.currency
      })`,
      tracePreview: `${row.provider}${row.providerPaymentId ? `:${row.providerPaymentId}` : ""}`,
      durationMs: null,
      traceId: row.id,
      userId: row.userId,
      host: null,
      stack: null,
      context: {
        provider: row.provider,
        providerPaymentId: row.providerPaymentId,
        amountCents: row.amountCents,
        currency: row.currency,
      },
    };
  }

  private jsonObject(value: Prisma.JsonValue | null): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  }

  private readString(obj: Record<string, unknown>, key: string): string | null {
    const val = obj[key];
    if (typeof val !== "string") return null;
    return val;
  }

  private readDurationMs(metadata: Record<string, unknown>): number | null {
    const ms = metadata.durationMs;
    if (typeof ms === "number" && Number.isFinite(ms)) return Math.round(ms);
    const sec = metadata.durationSeconds;
    if (typeof sec === "number" && Number.isFinite(sec)) return Math.round(sec * 1000);
    return null;
  }

  private percentTrend(current: number, previous: number) {
    if (previous === 0) {
      return { direction: "neutral", value: 0, unit: "percent" } as const;
    }
    const delta = Math.round(((current - previous) / previous) * 100);
    if (delta === 0) return { direction: "neutral", value: 0, unit: "percent" } as const;
    return {
      direction: delta > 0 ? "up" : "down",
      value: Math.abs(delta),
      unit: "percent",
    } as const;
  }

  private ppTrend(current: number, previous: number) {
    const delta = Number((current - previous).toFixed(1));
    if (delta === 0) return { direction: "neutral", value: 0, unit: "pp" } as const;
    return {
      direction: delta > 0 ? "up" : "down",
      value: Math.abs(delta),
      unit: "pp",
    } as const;
  }

  private absoluteTrend(current: number, previous: number) {
    const delta = current - previous;
    if (delta === 0) return { direction: "neutral", value: 0, unit: "ms" } as const;
    return {
      direction: delta > 0 ? "up" : "down",
      value: Math.abs(delta),
      unit: "ms",
    } as const;
  }

  private toCsv(items: LogListItem[]): string {
    const header = [
      "id",
      "timestamp",
      "level",
      "service",
      "message",
      "tracePreview",
      "durationMs",
      "traceId",
    ];
    const rows = items.map((item) => [
      item.id,
      item.timestamp,
      item.level,
      item.service,
      item.message,
      item.tracePreview ?? "",
      item.durationMs?.toString() ?? "",
      item.traceId,
    ]);

    return [header, ...rows]
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n");
  }

  private parseDate(value?: string): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private truncate(value: string, limit: number): string {
    if (value.length <= limit) return value;
    return `${value.slice(0, limit - 1)}…`;
  }
}
