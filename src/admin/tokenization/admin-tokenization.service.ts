import { Injectable, NotFoundException } from "@nestjs/common";
import { Level, Prisma, ProcessingTrigger, TokenStatus } from "@prisma/client";
import { TokenizerProcessor } from "src/markup-engine/tokenizer/tokenizer.processor";
import { PrismaService } from "src/prisma.service";
import { BulkTokenizationDto } from "./dto/bulk.dto";
import {
  AdminTokenizationListQueryDto,
  TokenizationSortBy,
  TokenizationTab,
} from "./dto/list-query.dto";
import { RunScope, RunTokenizationDto } from "./dto/run.dto";
import { ProblematicTokensQueryDto } from "./dto/tokens-query.dto";
import { UpdateTokenizationSettingsDto } from "./dto/update-settings.dto";

@Injectable()
export class AdminTokenizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenizerProcessor: TokenizerProcessor,
  ) {}

  // ────────────────────────────────────────────────────────────────────────────
  // STATS
  // ────────────────────────────────────────────────────────────────────────────

  async getStats() {
    const currentVersionIds = await this._getCurrentVersionIds();

    const [tokenGroups, totalTexts, processedTexts, issuesCount, pendingCount] =
      await Promise.all([
        this.prisma.textToken.groupBy({
          by: ["status"],
          where: { versionId: { in: currentVersionIds } },
          _count: { id: true },
        }),
        this.prisma.text.count(),
        this.prisma.text.count({
          where: { processingVersions: { some: { isCurrent: true } } },
        }),
        // Тексты с проблемными токенами
        this.prisma.text.count({
          where: {
            processingVersions: {
              some: {
                isCurrent: true,
                tokens: {
                  some: { status: { in: [TokenStatus.NOT_FOUND, TokenStatus.AMBIGUOUS] } },
                },
              },
            },
          },
        }),
        // Тексты без ни одной версии
        this.prisma.text.count({
          where: { processingVersions: { none: { isCurrent: true } } },
        }),
      ]);

    let analyzedCount = 0;
    let ambiguousCount = 0;
    let notFoundCount = 0;
    for (const g of tokenGroups) {
      if (g.status === TokenStatus.ANALYZED) analyzedCount = g._count.id;
      if (g.status === TokenStatus.AMBIGUOUS) ambiguousCount = g._count.id;
      if (g.status === TokenStatus.NOT_FOUND) notFoundCount = g._count.id;
    }
    const totalTokens = analyzedCount + ambiguousCount + notFoundCount;

    const pct = (n: number) =>
      totalTokens > 0 ? Math.round((n / totalTokens) * 1000) / 10 : 0;

    return {
      totalTokens,
      analyzedCount,
      analyzedPercent: pct(analyzedCount),
      ambiguousCount,
      ambiguousPercent: pct(ambiguousCount),
      notFoundCount,
      notFoundPercent: pct(notFoundCount),
      textsWithoutProcessing: pendingCount,
      // counts per tab
      tabs: {
        all: totalTexts,
        issues: issuesCount,
        notfound: notFoundCount,
        pending: pendingCount,
      },
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // DISTRIBUTION (donut + sources)
  // ────────────────────────────────────────────────────────────────────────────

  async getDistribution() {
    const currentVersionIds = await this._getCurrentVersionIds();

    if (!currentVersionIds.length) {
      return {
        total: 0,
        analyzed: 0,
        analyzedPercent: 0,
        ambiguous: 0,
        ambiguousPercent: 0,
        notFound: 0,
        notFoundPercent: 0,
        sources: { admin: 0, cache: 0, morphology: 0, online: 0 },
      };
    }

    const [tokenGroups, sourceGroups] = await Promise.all([
      this.prisma.textToken.groupBy({
        by: ["status"],
        where: { versionId: { in: currentVersionIds } },
        _count: { id: true },
      }),
      this.prisma.tokenAnalysis.groupBy({
        by: ["source"],
        where: {
          token: { versionId: { in: currentVersionIds } },
          isPrimary: true,
        },
        _count: { id: true },
      }),
    ]);

    let analyzed = 0;
    let ambiguous = 0;
    let notFound = 0;
    for (const g of tokenGroups) {
      if (g.status === TokenStatus.ANALYZED) analyzed = g._count.id;
      if (g.status === TokenStatus.AMBIGUOUS) ambiguous = g._count.id;
      if (g.status === TokenStatus.NOT_FOUND) notFound = g._count.id;
    }
    const total = analyzed + ambiguous + notFound;
    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);

    const sources: Record<string, number> = { admin: 0, cache: 0, morphology: 0, online: 0 };
    for (const g of sourceGroups) {
      const key = g.source.toLowerCase();
      sources[key] = g._count.id;
    }
    // morphology key mapping: MORPHOLOGY → morphology (already handled)

    return {
      total,
      analyzed,
      analyzedPercent: pct(analyzed),
      ambiguous,
      ambiguousPercent: pct(ambiguous),
      notFound,
      notFoundPercent: pct(notFound),
      sources,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // LIST TEXTS
  // ────────────────────────────────────────────────────────────────────────────

  async getTexts(query: AdminTokenizationListQueryDto = {}) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.TextWhereInput = {};

    if (query.search?.trim()) {
      where.title = { contains: query.search.trim(), mode: "insensitive" };
    }

    if (query.level) {
      where.level = query.level as Level;
    }

    switch (query.tab) {
      case TokenizationTab.PENDING:
        where.processingVersions = { none: { isCurrent: true } };
        break;
      case TokenizationTab.ISSUES:
        where.processingVersions = {
          some: {
            isCurrent: true,
            tokens: {
              some: { status: { in: [TokenStatus.NOT_FOUND, TokenStatus.AMBIGUOUS] } },
            },
          },
        };
        break;
      case TokenizationTab.NOT_FOUND:
        where.processingVersions = {
          some: {
            isCurrent: true,
            tokens: { some: { status: TokenStatus.NOT_FOUND } },
          },
        };
        break;
    }

    const [texts, total] = await Promise.all([
      this.prisma.text.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          level: true,
          processingStatus: true,
          processingProgress: true,
          updatedAt: true,
          _count: { select: { pages: true } },
          processingVersions: {
            where: { isCurrent: true },
            take: 1,
            select: {
              id: true,
              version: true,
              status: true,
              updatedAt: true,
            },
          },
        },
      }),
      this.prisma.text.count({ where }),
    ]);

    if (!texts.length) return { data: [], total: 0, page, limit };

    // Token stats для текущих версий
    const currentVersionIds = texts
      .flatMap((t) => t.processingVersions)
      .map((v) => v.id);

    const tokenStatsByVersionId = new Map<
      string,
      { total: number; analyzed: number; ambiguous: number; notFound: number }
    >();

    if (currentVersionIds.length) {
      const tokenGroups = await this.prisma.textToken.groupBy({
        by: ["versionId", "status"],
        where: { versionId: { in: currentVersionIds } },
        _count: { id: true },
      });

      for (const g of tokenGroups) {
        if (!tokenStatsByVersionId.has(g.versionId)) {
          tokenStatsByVersionId.set(g.versionId, {
            total: 0,
            analyzed: 0,
            ambiguous: 0,
            notFound: 0,
          });
        }
        const s = tokenStatsByVersionId.get(g.versionId)!;
        s.total += g._count.id;
        if (g.status === TokenStatus.ANALYZED) s.analyzed = g._count.id;
        if (g.status === TokenStatus.AMBIGUOUS) s.ambiguous = g._count.id;
        if (g.status === TokenStatus.NOT_FOUND) s.notFound = g._count.id;
      }
    }

    let data = texts.map((text) => {
      const currentVersion = text.processingVersions[0] ?? null;
      const ts = currentVersion
        ? (tokenStatsByVersionId.get(currentVersion.id) ?? {
            total: 0,
            analyzed: 0,
            ambiguous: 0,
            notFound: 0,
          })
        : null;

      return {
        id: text.id,
        title: text.title,
        level: text.level,
        pagesCount: text._count.pages,
        processingStatus: text.processingStatus,
        processingProgress: text.processingProgress,
        tokenizationVersion: currentVersion?.version ?? null,
        totalTokens: ts?.total ?? null,
        analyzedCount: ts?.analyzed ?? null,
        notFoundCount: ts?.notFound ?? null,
        ambiguousCount: ts?.ambiguous ?? null,
        analyzePercent:
          ts && ts.total > 0
            ? Math.round((ts.analyzed / ts.total) * 100)
            : null,
        processedAt: currentVersion?.updatedAt ?? null,
      };
    });

    // Клиентская сортировка (после загрузки статистики)
    if (query.sort === TokenizationSortBy.ERRORS) {
      data = data.sort((a, b) => (b.notFoundCount ?? 0) - (a.notFoundCount ?? 0));
    } else if (query.sort === TokenizationSortBy.NAME) {
      data = data.sort((a, b) => a.title.localeCompare(b.title));
    }

    return { data, total, page, limit };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // TEXT DETAIL
  // ────────────────────────────────────────────────────────────────────────────

  async getTextDetail(textId: string) {
    const text = await this.prisma.text.findUnique({
      where: { id: textId },
      select: {
        id: true,
        title: true,
        level: true,
        processingStatus: true,
        processingProgress: true,
        processingVersions: {
          where: { isCurrent: true },
          take: 1,
          select: {
            id: true,
            version: true,
            status: true,
            useNormalization: true,
            useMorphAnalysis: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!text) throw new NotFoundException("Text not found");

    const currentVersion = text.processingVersions[0] ?? null;
    let tokenStats = { total: 0, analyzed: 0, ambiguous: 0, notFound: 0 };
    let sources = { admin: 0, cache: 0, morphology: 0, online: 0 };

    if (currentVersion) {
      const [tokenGroups, sourceGroups] = await Promise.all([
        this.prisma.textToken.groupBy({
          by: ["status"],
          where: { versionId: currentVersion.id },
          _count: { id: true },
        }),
        this.prisma.tokenAnalysis.groupBy({
          by: ["source"],
          where: { token: { versionId: currentVersion.id }, isPrimary: true },
          _count: { id: true },
        }),
      ]);

      for (const g of tokenGroups) {
        tokenStats.total += g._count.id;
        if (g.status === TokenStatus.ANALYZED) tokenStats.analyzed = g._count.id;
        if (g.status === TokenStatus.AMBIGUOUS) tokenStats.ambiguous = g._count.id;
        if (g.status === TokenStatus.NOT_FOUND) tokenStats.notFound = g._count.id;
      }

      for (const g of sourceGroups) {
        const key = g.source.toLowerCase() as keyof typeof sources;
        if (key in sources) sources[key] = g._count.id;
      }
    }

    const pct = (n: number) =>
      tokenStats.total > 0
        ? Math.round((n / tokenStats.total) * 1000) / 10
        : 0;

    return {
      id: text.id,
      title: text.title,
      level: text.level,
      processingStatus: text.processingStatus,
      processingProgress: text.processingProgress,
      version: currentVersion
        ? {
            id: currentVersion.id,
            version: currentVersion.version,
            status: currentVersion.status,
            useNormalization: currentVersion.useNormalization,
            useMorphAnalysis: currentVersion.useMorphAnalysis,
            updatedAt: currentVersion.updatedAt,
          }
        : null,
      tokenStats: {
        ...tokenStats,
        analyzePercent: pct(tokenStats.analyzed),
        ambiguousPercent: pct(tokenStats.ambiguous),
        notFoundPercent: pct(tokenStats.notFound),
      },
      sources,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PROBLEMATIC TOKENS
  // ────────────────────────────────────────────────────────────────────────────

  async getProblematicTokens(textId: string, query: ProblematicTokensQueryDto = {}) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 50));
    const skip = (page - 1) * limit;

    const currentVersion = await this.prisma.textProcessingVersion.findFirst({
      where: { textId, isCurrent: true },
      select: { id: true },
    });

    if (!currentVersion) throw new NotFoundException("Нет текущей версии токенизации для этого текста");

    const statusFilter: TokenStatus[] = query.status
      ? [query.status as TokenStatus]
      : [TokenStatus.NOT_FOUND, TokenStatus.AMBIGUOUS];

    const tokenWhere: Prisma.TextTokenWhereInput = {
      versionId: currentVersion.id,
      status: { in: statusFilter },
    };

    const [tokens, total] = await Promise.all([
      this.prisma.textToken.findMany({
        where: tokenWhere,
        skip,
        take: limit,
        orderBy: { position: "asc" },
        select: {
          id: true,
          original: true,
          normalized: true,
          status: true,
          position: true,
          page: { select: { pageNumber: true } },
          analyses: {
            where: { isPrimary: true },
            take: 1,
            select: { source: true },
          },
        },
      }),
      this.prisma.textToken.count({ where: tokenWhere }),
    ]);

    const data = tokens.map((t) => ({
      id: t.id,
      original: t.original,
      normalized: t.normalized,
      status: t.status,
      source: t.analyses[0]?.source ?? null,
      pageNumber: t.page?.pageNumber ?? null,
      position: t.position,
    }));

    return { data, total, page, limit };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RUN PROCESSING
  // ────────────────────────────────────────────────────────────────────────────

  async runProcessing(dto: RunTokenizationDto, userId: string) {
    let textIds: string[] = [];

    switch (dto.scope) {
      case RunScope.PENDING: {
        const texts = await this.prisma.text.findMany({
          where: { processingVersions: { none: { isCurrent: true } } },
          select: { id: true },
        });
        textIds = texts.map((t) => t.id);
        break;
      }
      case RunScope.ERRORS: {
        const versions = await this.prisma.textProcessingVersion.findMany({
          where: {
            isCurrent: true,
            tokens: {
              some: { status: { in: [TokenStatus.NOT_FOUND, TokenStatus.AMBIGUOUS] } },
            },
          },
          select: { textId: true },
        });
        textIds = versions.map((v) => v.textId);
        break;
      }
      case RunScope.ALL: {
        const texts = await this.prisma.text.findMany({ select: { id: true } });
        textIds = texts.map((t) => t.id);
        break;
      }
    }

    return this._startBulkProcessing(textIds, userId);
  }

  async runProcessingForText(textId: string, userId: string) {
    const text = await this.prisma.text.findUnique({
      where: { id: textId },
      select: { id: true },
    });
    if (!text) throw new NotFoundException("Text not found");

    void this.tokenizerProcessor
      .processText(textId, { trigger: ProcessingTrigger.MANUAL, initiatorId: userId })
      .catch(() => {});

    return { textId, started: true };
  }

  async cancelProcessing(textId: string) {
    const text = await this.prisma.text.findUnique({
      where: { id: textId },
      select: { id: true, processingStatus: true },
    });
    if (!text) throw new NotFoundException("Text not found");

    await this.prisma.text.update({
      where: { id: textId },
      data: { processingStatus: "IDLE", processingProgress: 0 },
    });

    return { textId, cancelled: true };
  }

  async resetTokens(textId: string) {
    const text = await this.prisma.text.findUnique({
      where: { id: textId },
      select: { id: true },
    });
    if (!text) throw new NotFoundException("Text not found");

    await this.prisma.textProcessingVersion.deleteMany({ where: { textId } });
    await this.prisma.text.update({
      where: { id: textId },
      data: {
        processingStatus: "IDLE",
        processingProgress: 0,
        processingError: null,
      },
    });

    return { textId, reset: true };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // BULK ACTIONS
  // ────────────────────────────────────────────────────────────────────────────

  async bulkRun(dto: BulkTokenizationDto, userId: string) {
    return this._startBulkProcessing(dto.textIds, userId);
  }

  async bulkReset(dto: BulkTokenizationDto) {
    await this.prisma.textProcessingVersion.deleteMany({
      where: { textId: { in: dto.textIds } },
    });
    await this.prisma.text.updateMany({
      where: { id: { in: dto.textIds } },
      data: { processingStatus: "IDLE", processingProgress: 0, processingError: null },
    });
    return { reset: dto.textIds.length };
  }

  private async _startBulkProcessing(textIds: string[], userId: string) {
    for (const textId of textIds) {
      void this.tokenizerProcessor
        .processText(textId, { trigger: ProcessingTrigger.MANUAL, initiatorId: userId })
        .catch(() => {});
    }
    return { started: textIds.length, textIds };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // QUEUE
  // ────────────────────────────────────────────────────────────────────────────

  async getQueue() {
    const processing = await this.prisma.text.findMany({
      where: { processingStatus: "RUNNING" },
      orderBy: { updatedAt: "asc" },
      select: {
        id: true,
        title: true,
        processingProgress: true,
      },
    });

    return {
      items: processing.map((t) => ({
        textId: t.id,
        title: t.title,
        progress: t.processingProgress,
        queueStatus: "PROCESSING" as const,
      })),
      count: processing.length,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // SETTINGS (singleton id=1)
  // ────────────────────────────────────────────────────────────────────────────

  async getSettings() {
    const settings = await this.prisma.tokenizationSettings.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
    return settings;
  }

  async updateSettings(dto: UpdateTokenizationSettingsDto) {
    return this.prisma.tokenizationSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...dto },
      update: dto,
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ────────────────────────────────────────────────────────────────────────────

  private async _getCurrentVersionIds(): Promise<string[]> {
    const versions = await this.prisma.textProcessingVersion.findMany({
      where: { isCurrent: true },
      select: { id: true },
    });
    return versions.map((v) => v.id);
  }
}
