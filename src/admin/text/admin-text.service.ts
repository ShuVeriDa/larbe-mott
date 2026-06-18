import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { NotificationType, Prisma, ProcessingStatus, ProcessingTrigger } from "@prisma/client";
import { ErrorCode } from "src/common/errors/error-codes";
import { BulkImportResultItem } from "src/admin/text/dto/bulk-import.dto";
import { CreateTextDto } from "src/admin/text/dto/create.dto";
import {
  AdminListTextsQueryDto,
  SortOrder,
  TextSortBy,
  TextStatusFilter,
} from "src/admin/text/dto/list-query.dto";
import { ProcessTextDto } from "src/admin/text/dto/process.dto";
import { PatchTextDto, TextStatusUpdate } from "src/admin/text/dto/update.dto";
import { extractTextFromTiptap } from "src/common/utils/extractTextFromTiptap";
import {
  ProcessTextOpts,
  TokenizerProcessor,
} from "src/markup-engine/tokenizer/tokenizer.processor";
import { NOTIFICATION_EVENTS } from "src/notification/notification-events";
import { PrismaService } from "src/prisma.service";
import { TextProgressService } from "src/progress/text-progress/text-progress.service";
import { WordProgressService } from "src/progress/word-progress/word-progress.service";
import { ImageProcessingService } from "src/common/image-processing/image-processing.service";
import * as fs from "fs";
import { join } from "path";

@Injectable()
export class AdminTextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenizerProcessor: TokenizerProcessor,
    private readonly wordProgress: WordProgressService,
    private readonly textProgress: TextProgressService,
    private readonly eventEmitter: EventEmitter2,
    private readonly imageProcessing: ImageProcessingService,
  ) {}

  // ────────────────────────────────────────────────────────────────────────────
  // STATS
  // ────────────────────────────────────────────────────────────────────────────

  async getTextStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      total,
      published,
      archived,
      processingCount,
      errorCount,
      createdThisMonth,
    ] = await Promise.all([
      this.prisma.text.count(),
      this.prisma.text.count({
        where: { publishedAt: { not: null }, archivedAt: null },
      }),
      this.prisma.text.count({ where: { archivedAt: { not: null } } }),
      this.prisma.text.count({ where: { processingStatus: "RUNNING" } }),
      this.prisma.text.count({ where: { processingStatus: "ERROR" } }),
      this.prisma.text.count({ where: { createdAt: { gte: startOfMonth } } }),
    ]);

    const draftCount = total - published - archived;
    const publishedPercent =
      total > 0 ? Math.round((published / total) * 100) : 0;

    return {
      totalCount: total,
      totalGrowthPerMonth: createdThisMonth,
      publishedCount: published,
      publishedPercent,
      draftCount,
      archivedCount: archived,
      processingCount,
      errorCount,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // LIST
  // ────────────────────────────────────────────────────────────────────────────

  async getTextsForAdmin(query: AdminListTextsQueryDto = {}) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.TextWhereInput = {};

    if (query.search?.trim()) {
      where.title = { contains: query.search.trim(), mode: "insensitive" };
    }

    if (query.level) {
      where.level = query.level;
    }

    if (query.tagId) {
      where.tags = { some: { tagId: query.tagId } };
    }

    if (query.status && query.status !== TextStatusFilter.ALL) {
      switch (query.status) {
        case TextStatusFilter.PUBLISHED:
          where.publishedAt = { not: null };
          where.archivedAt = null;
          break;
        case TextStatusFilter.DRAFT:
          where.publishedAt = null;
          where.archivedAt = null;
          where.processingStatus = { notIn: ["RUNNING", "ERROR"] };
          break;
        case TextStatusFilter.ARCHIVED:
          where.archivedAt = { not: null };
          break;
        case TextStatusFilter.PROCESSING:
          where.processingStatus = "RUNNING";
          break;
        case TextStatusFilter.ERROR:
          where.processingStatus = "ERROR";
          break;
      }
    }

    const dir: "asc" | "desc" =
      query.sortOrder === SortOrder.ASC ? "asc" : "desc";

    let orderBy: Prisma.TextOrderByWithRelationInput = { createdAt: "desc" };
    switch (query.sortBy) {
      case TextSortBy.TITLE:
        orderBy = { title: dir };
        break;
      case TextSortBy.LEVEL:
        orderBy = { level: dir };
        break;
      case TextSortBy.READ_COUNT:
        orderBy = { progress: { _count: dir } };
        break;
      case TextSortBy.CREATED_AT:
      default:
        orderBy = { createdAt: dir };
    }

    const [texts, total] = await Promise.all([
      this.prisma.text.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: { submittedBy: { select: { id: true, name: true, surname: true, username: true } } },
      }),
      this.prisma.text.count({ where }),
    ]);

    if (!texts.length) {
      return { data: [], total: 0, page, limit };
    }

    const ids = texts.map((t) => t.id);

    const versions = await this.prisma.textProcessingVersion.findMany({
      where: { textId: { in: ids } },
      orderBy: { version: "desc" },
      select: { id: true, textId: true },
    });
    const latestVersionIdByTextId = new Map<string, string>();
    for (const v of versions) {
      if (!latestVersionIdByTextId.has(v.textId)) {
        latestVersionIdByTextId.set(v.textId, v.id);
      }
    }
    const versionIds = [...latestVersionIdByTextId.values()];

    const tokenCounts = await this.prisma.textToken.groupBy({
      by: ["versionId"],
      where: { versionId: { in: versionIds } },
      _count: { id: true },
    });
    const countByVersionId = new Map(
      tokenCounts.map((c) => [c.versionId, c._count.id]),
    );

    const tagRows = await this.prisma.textTag.findMany({
      where: { textId: { in: ids } },
      include: { tag: { select: { id: true, name: true } } },
    });
    const tagsByTextId = new Map<string, { id: string; name: string }[]>();
    for (const row of tagRows) {
      if (!tagsByTextId.has(row.textId)) tagsByTextId.set(row.textId, []);
      tagsByTextId.get(row.textId)!.push(row.tag);
    }

    const readCounts = await this.prisma.userTextProgress.groupBy({
      by: ["textId"],
      where: { textId: { in: ids } },
      _count: { userId: true },
    });
    const readCountByTextId = new Map(
      readCounts.map((r) => [r.textId, r._count.userId]),
    );

    const data = texts.map((t) => {
      const versionId = latestVersionIdByTextId.get(t.id);
      const tokenCount = versionId ? (countByVersionId.get(versionId) ?? 0) : 0;
      return {
        ...t,
        tokenCount,
        tags: tagsByTextId.get(t.id) ?? [],
        readCount: readCountByTextId.get(t.id) ?? 0,
      };
    });

    return { data, total, page, limit };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // EXPORT LIST
  // ────────────────────────────────────────────────────────────────────────────

  async exportTexts(
    query: AdminListTextsQueryDto,
    format: "json" | "csv",
    ids?: string[],
  ) {
    const where: Prisma.TextWhereInput = {};

    if (ids?.length) {
      where.id = { in: ids };
    } else {
      if (query.search?.trim()) {
        where.title = { contains: query.search.trim(), mode: "insensitive" };
      }
      if (query.level) {
        where.level = query.level;
      }
      if (query.tagId) {
        where.tags = { some: { tagId: query.tagId } };
      }
      if (query.status && query.status !== TextStatusFilter.ALL) {
        switch (query.status) {
          case TextStatusFilter.PUBLISHED:
            where.publishedAt = { not: null };
            where.archivedAt = null;
            break;
          case TextStatusFilter.DRAFT:
            where.publishedAt = null;
            where.archivedAt = null;
            where.processingStatus = { notIn: ["RUNNING", "ERROR"] };
            break;
          case TextStatusFilter.ARCHIVED:
            where.archivedAt = { not: null };
            break;
          case TextStatusFilter.PROCESSING:
            where.processingStatus = "RUNNING";
            break;
          case TextStatusFilter.ERROR:
            where.processingStatus = "ERROR";
            break;
        }
      }
    }

    const dir: "asc" | "desc" =
      query.sortOrder === SortOrder.ASC ? "asc" : "desc";
    let orderBy: Prisma.TextOrderByWithRelationInput = { createdAt: "desc" };
    switch (query.sortBy) {
      case TextSortBy.TITLE:
        orderBy = { title: dir };
        break;
      case TextSortBy.LEVEL:
        orderBy = { level: dir };
        break;
      case TextSortBy.READ_COUNT:
        orderBy = { progress: { _count: dir } };
        break;
      default:
        orderBy = { createdAt: dir };
    }

    const texts = await this.prisma.text.findMany({
      where,
      orderBy,
      include: { pages: { orderBy: { pageNumber: "asc" } } },
    });

    if (!texts.length) {
      return format === "csv" ? "" : [];
    }

    const textIds = texts.map((t) => t.id);

    const versions = await this.prisma.textProcessingVersion.findMany({
      where: { textId: { in: textIds } },
      orderBy: { version: "desc" },
      select: { id: true, textId: true },
    });
    const latestVersionIdByTextId = new Map<string, string>();
    for (const v of versions) {
      if (!latestVersionIdByTextId.has(v.textId))
        latestVersionIdByTextId.set(v.textId, v.id);
    }
    const versionIds = [...latestVersionIdByTextId.values()];

    const tokenCounts = await this.prisma.textToken.groupBy({
      by: ["versionId"],
      where: { versionId: { in: versionIds } },
      _count: { id: true },
    });
    const countByVersionId = new Map(
      tokenCounts.map((c) => [c.versionId, c._count.id]),
    );

    const tagRows = await this.prisma.textTag.findMany({
      where: { textId: { in: textIds } },
      include: { tag: { select: { id: true, name: true } } },
    });
    const tagsByTextId = new Map<string, { id: string; name: string }[]>();
    for (const row of tagRows) {
      if (!tagsByTextId.has(row.textId)) tagsByTextId.set(row.textId, []);
      tagsByTextId.get(row.textId)!.push(row.tag);
    }

    const readCounts = await this.prisma.userTextProgress.groupBy({
      by: ["textId"],
      where: { textId: { in: textIds } },
      _count: { userId: true },
    });
    const readCountByTextId = new Map(
      readCounts.map((r) => [r.textId, r._count.userId]),
    );

    const data = texts.map((t) => {
      const versionId = latestVersionIdByTextId.get(t.id);
      const tokenCount = versionId ? (countByVersionId.get(versionId) ?? 0) : 0;
      return {
        id: t.id,
        title: t.title,
        description: t.description ?? null,
        language: t.language,
        level: t.level,
        status: t.archivedAt
          ? "archived"
          : t.publishedAt
            ? "published"
            : "draft",
        author: t.author,
        source: t.source,
        imageUrl: t.imageUrl ?? null,
        autoTokenizeOnSave: t.autoTokenizeOnSave,
        useNormalization: t.useNormalization,
        useMorphAnalysis: t.useMorphAnalysis,
        processingStatus: t.processingStatus,
        processingProgress: t.processingProgress,
        processingError: t.processingError ?? null,
        tokenCount,
        readCount: readCountByTextId.get(t.id) ?? 0,
        tags: (tagsByTextId.get(t.id) ?? []).map((tag) => tag.name).join(", "),
        pages: t.pages.map((p) => ({
          pageNumber: p.pageNumber,
          title: p.title ?? null,
          contentRich: p.contentRich,
          contentRaw: p.contentRaw,
        })),
        publishedAt: t.publishedAt?.toISOString() ?? null,
        archivedAt: t.archivedAt?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      };
    });

    if (format === "json") return data;

    const columns = [
      "id",
      "title",
      "description",
      "language",
      "level",
      "status",
      "author",
      "source",
      "imageUrl",
      "autoTokenizeOnSave",
      "useNormalization",
      "useMorphAnalysis",
      "processingStatus",
      "processingProgress",
      "processingError",
      "tokenCount",
      "readCount",
      "tags",
      "publishedAt",
      "archivedAt",
      "createdAt",
      "updatedAt",
    ] as const;

    const escape = (v: unknown): string => {
      if (v == null) return "";
      const s = String(v);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const header = columns.join(",");
    const rows = data.map((row) =>
      columns.map((col) => escape(row[col])).join(","),
    );
    return [header, ...rows].join("\n");
  }

  // ────────────────────────────────────────────────────────────────────────────
  // EXPORT SINGLE TEXT
  // ────────────────────────────────────────────────────────────────────────────

  async exportTextById(textId: string, format: "json" | "csv") {
    const text = await this.prisma.text.findUnique({
      where: { id: textId },
      include: {
        pages: { orderBy: { pageNumber: "asc" } },
        tags: { include: { tag: { select: { id: true, name: true } } } },
      },
    });
    if (!text) throw new NotFoundException({ code: ErrorCode.TEXT_NOT_FOUND, message: "Text not found" });

    if (format === "json") {
      return {
        id: text.id,
        title: text.title,
        language: text.language,
        level: text.level,
        status: text.archivedAt
          ? "archived"
          : text.publishedAt
            ? "published"
            : "draft",
        author: text.author,
        source: text.source,
        description: text.description,
        imageUrl: text.imageUrl,
        tags: text.tags.map((t) => t.tag.name),
        publishedAt: text.publishedAt?.toISOString() ?? null,
        archivedAt: text.archivedAt?.toISOString() ?? null,
        createdAt: text.createdAt.toISOString(),
        updatedAt: text.updatedAt.toISOString(),
        pages: text.pages.map((p) => ({
          pageNumber: p.pageNumber,
          title: p.title,
          contentRaw: p.contentRaw,
          contentRich: p.contentRich,
        })),
      };
    }

    const escape = (v: unknown): string => {
      if (v == null) return "";
      const s = String(v);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const header = "pageNumber,pageTitle,content";
    const rows = text.pages.map((p) =>
      [escape(p.pageNumber), escape(p.title), escape(p.contentRaw)].join(","),
    );
    return [header, ...rows].join("\n");
  }

  // ────────────────────────────────────────────────────────────────────────────
  // GET BY ID
  // ────────────────────────────────────────────────────────────────────────────

  async getTextById(textId: string) {
    const text = await this.prisma.text.findUnique({
      where: { id: textId },
      include: {
        pages: { orderBy: { pageNumber: "asc" } },
        tags: { include: { tag: { select: { id: true, name: true } } } },
        submittedBy: { select: { id: true, name: true, surname: true, username: true } },
      },
    });
    if (!text) throw new NotFoundException({ code: ErrorCode.TEXT_NOT_FOUND, message: "Text not found" });

    const latestVersion = await this.prisma.textProcessingVersion.findFirst({
      where: { textId },
      orderBy: { version: "desc" },
      select: { id: true, version: true, createdAt: true },
    });

    let tokenCount = 0;
    let wordCount = 0;
    const tokenCountByPageId = new Map<string, number>();
    const wordCountByPageId = new Map<string, number>();

    if (latestVersion) {
      const [total, totalWords, perPage, perPageWords] = await Promise.all([
        this.prisma.textToken.count({ where: { versionId: latestVersion.id } }),
        this.prisma.textToken.count({
          where: { versionId: latestVersion.id, normalized: { not: "" } },
        }),
        this.prisma.textToken.groupBy({
          by: ["pageId"],
          where: { versionId: latestVersion.id, pageId: { not: null } },
          _count: { id: true },
        }),
        this.prisma.textToken.groupBy({
          by: ["pageId"],
          where: {
            versionId: latestVersion.id,
            pageId: { not: null },
            normalized: { not: "" },
          },
          _count: { id: true },
        }),
      ]);
      tokenCount = total;
      wordCount = totalWords;
      for (const row of perPage) {
        if (row.pageId) tokenCountByPageId.set(row.pageId, row._count.id);
      }
      for (const row of perPageWords) {
        if (row.pageId) wordCountByPageId.set(row.pageId, row._count.id);
      }
    }

    return {
      ...text,
      tags: text.tags.map((tt) => tt.tag),
      pages: text.pages.map((p) => ({
        ...p,
        tokenCount: tokenCountByPageId.get(p.id) ?? 0,
        wordCount: wordCountByPageId.get(p.id) ?? 0,
      })),
      tokenCount,
      wordCount,
      latestVersion: latestVersion ?? null,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CREATE
  // ────────────────────────────────────────────────────────────────────────────

  async addNewText(dto: CreateTextDto, userId: string) {
    const shouldTokenize = dto.autoTokenize !== false;

    let publishedAt: Date | null = null;
    let archivedAt: Date | null = null;
    if (dto.status === TextStatusUpdate.PUBLISHED) {
      publishedAt = new Date();
    } else if (dto.status === TextStatusUpdate.ARCHIVED) {
      archivedAt = new Date();
    } else if (dto.status === undefined && dto.publish === true) {
      publishedAt = new Date();
    }

    const text = await this.prisma.$transaction(async (tx) => {
      const created = await tx.text.create({
        data: {
          title: dto.title,
          description: dto.description,
          language: dto.language,
          level: dto.level,
          author: dto.author,
          source: dto.source,
          genreId: dto.genreId ?? null,
          imageUrl: dto.imageUrl ?? null,
          publishedAt,
          archivedAt,
          createdById: userId,
          autoTokenizeOnSave: dto.autoTokenizeOnSave ?? true,
          useNormalization: dto.useNormalization ?? true,
          useMorphAnalysis: dto.useMorphAnalysis ?? false,
        },
      });

      for (const page of dto.pages) {
        const contentRaw = extractTextFromTiptap(page.contentRich);
        await tx.textPage.create({
          data: {
            textId: created.id,
            pageNumber: page.pageNumber,
            title: page.title,
            contentRich: page.contentRich as Prisma.InputJsonValue,
            contentRaw,
          },
        });
      }

      const resolvedTagIds = await this.resolveTagIds(
        tx,
        dto.tagIds,
        dto.tagNames,
      );
      if (resolvedTagIds.length) {
        await tx.textTag.createMany({
          data: resolvedTagIds.map((tagId) => ({ textId: created.id, tagId })),
        });
      }

      return tx.text.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          pages: true,
          tags: { include: { tag: { select: { id: true, name: true } } } },
        },
      });
    });

    if (shouldTokenize) {
      void this.tokenizerProcessor
        .processText(text.id, {
          trigger: ProcessingTrigger.AUTO_ON_CREATE,
          initiatorId: userId,
          useNormalization: dto.useNormalization ?? true,
          useMorphAnalysis: dto.useMorphAnalysis ?? false,
          label: "первичная токенизация",
        })
        .catch(() => undefined);
    }

    return { ...text, tags: text.tags.map((tt) => tt.tag) };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // UPDATE
  // ────────────────────────────────────────────────────────────────────────────

  async patchText(textId: string, dto: PatchTextDto, userId: string) {
    const text = await this.prisma.text.findUnique({
      where: { id: textId },
      include: { pages: true },
    });
    if (!text) throw new NotFoundException({ code: ErrorCode.TEXT_NOT_FOUND, message: "Text not found" });

    const updated = await this.prisma.$transaction(async (tx) => {
      const textData: Parameters<typeof tx.text.update>[0]["data"] = {};
      if (dto.title !== undefined) textData.title = dto.title;
      if (dto.description !== undefined) textData.description = dto.description;
      if (dto.language !== undefined) textData.language = dto.language;
      if (dto.level !== undefined) textData.level = dto.level;
      if (dto.author !== undefined) textData.author = dto.author;
      if (dto.source !== undefined) textData.source = dto.source;
      if (dto.imageUrl !== undefined) {
        textData.imageUrl = dto.imageUrl === null ? null : dto.imageUrl;
      }
      if (dto.genreId !== undefined) {
        textData.genreId = dto.genreId === null ? null : dto.genreId;
      }
      if (dto.autoTokenizeOnSave !== undefined)
        textData.autoTokenizeOnSave = dto.autoTokenizeOnSave;
      if (dto.useNormalization !== undefined)
        textData.useNormalization = dto.useNormalization;
      if (dto.useMorphAnalysis !== undefined)
        textData.useMorphAnalysis = dto.useMorphAnalysis;

      if (dto.status !== undefined) {
        if (dto.status === TextStatusUpdate.PUBLISHED) {
          textData.publishedAt = new Date();
          textData.archivedAt = null;
        } else if (dto.status === TextStatusUpdate.ARCHIVED) {
          textData.archivedAt = new Date();
        } else if (dto.status === TextStatusUpdate.DRAFT) {
          textData.publishedAt = null;
          textData.archivedAt = null;
        }
      }

      if (dto.publishedAt !== undefined) {
        textData.publishedAt =
          dto.publishedAt === null || dto.publishedAt === ""
            ? null
            : new Date(dto.publishedAt);
      }
      if (dto.archivedAt !== undefined) {
        textData.archivedAt =
          dto.archivedAt === null || dto.archivedAt === ""
            ? null
            : new Date(dto.archivedAt);
      }

      if (Object.keys(textData).length > 0) {
        await tx.text.update({ where: { id: textId }, data: textData });
      }

      if (dto.pages !== undefined) {
        await tx.textPage.deleteMany({ where: { textId } });
        for (const page of dto.pages) {
          const contentRaw = extractTextFromTiptap(page.contentRich);
          await tx.textPage.create({
            data: {
              textId,
              pageNumber: page.pageNumber,
              title: page.title,
              contentRich: page.contentRich as Prisma.InputJsonValue,
              contentRaw,
            },
          });
        }
      }

      if (dto.tagIds !== undefined || dto.tagNames !== undefined) {
        await tx.textTag.deleteMany({ where: { textId } });
        const resolvedTagIds = await this.resolveTagIds(
          tx,
          dto.tagIds,
          dto.tagNames,
        );
        if (resolvedTagIds.length > 0) {
          await tx.textTag.createMany({
            data: resolvedTagIds.map((tagId) => ({ textId, tagId })),
          });
        }
      }

      return tx.text.findUniqueOrThrow({
        where: { id: textId },
        include: {
          pages: { orderBy: { pageNumber: "asc" } },
          tags: { include: { tag: { select: { id: true, name: true } } } },
        },
      });
    });

    if (dto.pages !== undefined) {
      const finalAutoTokenize =
        dto.autoTokenizeOnSave !== undefined
          ? dto.autoTokenizeOnSave
          : updated.autoTokenizeOnSave;

      if (finalAutoTokenize) {
        void this.tokenizerProcessor
          .processText(updated.id, {
            trigger: ProcessingTrigger.AUTO_ON_SAVE,
            initiatorId: userId,
            useNormalization: updated.useNormalization,
            useMorphAnalysis: updated.useMorphAnalysis,
            label: "правка текста",
          })
          .catch(() => undefined);
      }
    }

    const wasUnpublished = text.publishedAt === null;
    const isNowPublished = updated.publishedAt !== null;
    if (wasUnpublished && isNowPublished) {
      void this.emitNewLibraryText(updated.id, updated.title).catch(() => undefined);
    }

    return { ...updated, tags: updated.tags.map((tt) => tt.tag) };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // COVER UPLOAD
  // ────────────────────────────────────────────────────────────────────────────

  async uploadCover(textId: string, file: Express.Multer.File) {
    const text = await this.prisma.text.findUnique({ where: { id: textId } });
    if (!text) throw new NotFoundException({ code: ErrorCode.TEXT_NOT_FOUND, message: "Text not found" });

    if (text.imageUrl?.startsWith("/uploads/covers/")) {
      fs.unlink(join(process.cwd(), text.imageUrl), () => {});
      const origPath = join(process.cwd(), text.imageUrl.replace("/covers/", "/covers/originals/").replace(/\.webp$/, "").replace(/([^/]+)$/, "$1-orig.jpg"));
      fs.unlink(origPath, () => {});
    }

    const baseName = `${textId}-${Date.now()}`;
    const outputDir = join(process.cwd(), "uploads", "covers");
    const originalsDir = join(process.cwd(), "uploads", "covers", "originals");

    const tmpPath = join(outputDir, `${baseName}-tmp`);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(tmpPath, file.buffer);

    const result = await this.imageProcessing.processCover(tmpPath, baseName, outputDir, originalsDir);

    await this.prisma.text.update({
      where: { id: textId },
      data: { imageUrl: result.imageUrlOptimized },
    });

    return result;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // DELETE
  // ────────────────────────────────────────────────────────────────────────────

  async deleteText(textId: string) {
    const text = await this.prisma.text.findUnique({ where: { id: textId } });
    if (!text) throw new NotFoundException({ code: ErrorCode.TEXT_NOT_FOUND, message: "Text not found" });
    await this.deleteTextById(textId);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PROCESS (start new processing run)
  // ────────────────────────────────────────────────────────────────────────────

  async startProcessing(
    textId: string,
    dto: ProcessTextDto,
    initiatorId: string,
  ) {
    const text = await this.prisma.text.findUnique({ where: { id: textId } });
    if (!text) throw new NotFoundException({ code: ErrorCode.TEXT_NOT_FOUND, message: "Text not found" });

    const opts: ProcessTextOpts = {
      trigger: ProcessingTrigger.MANUAL,
      initiatorId,
      useNormalization: dto.useNormalization ?? true,
      useMorphAnalysis: dto.useMorphAnalysis ?? true,
      label: "токенизация",
    };

    void this.tokenizerProcessor
      .processText(textId, opts)
      .catch(() => undefined);

    return { textId, started: true };
  }

  /**
   * Lightweight snapshot of the latest processing version (for SSE polling).
   * Returns null if no version exists yet.
   */
  async getLatestVersionStatus(textId: string) {
    const v = await this.prisma.textProcessingVersion.findFirst({
      where: { textId },
      orderBy: { version: "desc" },
      select: {
        id: true,
        version: true,
        status: true,
        progress: true,
        errorMessage: true,
        durationMs: true,
        isCurrent: true,
        updatedAt: true,
      },
    });
    return v;
  }

  // Keep for backward compatibility
  async retokenizeText(textId: string, initiatorId?: string) {
    return this.startProcessing(
      textId,
      { useNormalization: true, useMorphAnalysis: true },
      initiatorId ?? "",
    );
  }

  async clearDictionaryCache(textId: string): Promise<{ deleted: number }> {
    const text = await this.prisma.text.findUnique({ where: { id: textId } });
    if (!text) throw new NotFoundException({ code: ErrorCode.TEXT_NOT_FOUND, message: "Text not found" });

    const currentVersion = await this.prisma.textProcessingVersion.findFirst({
      where: { textId, isCurrent: true },
      select: { id: true },
    });
    if (!currentVersion) return { deleted: 0 };

    const words = await this.prisma.textToken.findMany({
      where: { versionId: currentVersion.id, normalized: { not: "" } },
      select: { normalized: true },
      distinct: ["normalized"],
    });

    if (!words.length) return { deleted: 0 };

    const normalized = words.map((w) => w.normalized);
    const result = await this.prisma.dictionaryCache.deleteMany({
      where: { normalized: { in: normalized } },
    });

    return { deleted: result.count };
  }

  /**
   * Retry a previous (typically ERROR) version: copies its useNormalization /
   * useMorphAnalysis settings into a new processing run.
   */
  async retryVersion(textId: string, versionId: string, initiatorId: string) {
    const version = await this.prisma.textProcessingVersion.findFirst({
      where: { id: versionId, textId },
      select: { useNormalization: true, useMorphAnalysis: true },
    });
    if (!version) throw new NotFoundException({ code: ErrorCode.TEXT_VERSION_NOT_FOUND, message: "Version not found" });

    return this.startProcessing(
      textId,
      {
        useNormalization: version.useNormalization,
        useMorphAnalysis: version.useMorphAnalysis,
      },
      initiatorId,
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // VERSIONS — list
  // ────────────────────────────────────────────────────────────────────────────

  async getTextVersions(textId: string, statusFilter?: ProcessingStatus) {
    const text = await this.prisma.text.findUnique({ where: { id: textId } });
    if (!text) throw new NotFoundException({ code: ErrorCode.TEXT_NOT_FOUND, message: "Text not found" });

    // Counters always reflect the full history (so the filter tabs show real totals).
    const counters = await this.prisma.textProcessingVersion.groupBy({
      by: ["status"],
      where: { textId },
      _count: { _all: true },
    });
    const totalAll = counters.reduce((s, c) => s + c._count._all, 0);
    const successCountAll =
      counters.find((c) => c.status === "COMPLETED")?._count._all ?? 0;
    const errorCountAll =
      counters.find((c) => c.status === "ERROR")?._count._all ?? 0;

    const versions = await this.prisma.textProcessingVersion.findMany({
      where: { textId, ...(statusFilter ? { status: statusFilter } : {}) },
      orderBy: { version: "desc" },
      include: {
        initiator: { select: { id: true, name: true, surname: true } },
      },
    });

    if (!versions.length) {
      return {
        textId,
        total: totalAll,
        successCount: successCountAll,
        errorCount: errorCountAll,
        data: [],
      };
    }

    const versionIds = versions.map((v) => v.id);

    const [tokenCounts, unknownCounts, pageCounts] = await Promise.all([
      this.prisma.textToken.groupBy({
        by: ["versionId"],
        where: { versionId: { in: versionIds } },
        _count: { id: true },
      }),
      this.prisma.textToken.groupBy({
        by: ["versionId"],
        where: { versionId: { in: versionIds }, analyses: { none: {} } },
        _count: { id: true },
      }),
      this.prisma.textToken.groupBy({
        by: ["versionId", "pageId"],
        where: { versionId: { in: versionIds }, pageId: { not: null } },
        _count: { id: true },
      }),
    ]);

    const countByVersionId = new Map(
      tokenCounts.map((c) => [c.versionId, c._count.id]),
    );
    const unknownByVersionId = new Map(
      unknownCounts.map((c) => [c.versionId, c._count.id]),
    );
    const pageCountByVersionId = new Map<string, number>();
    for (const row of pageCounts) {
      if (!row.versionId) continue;
      pageCountByVersionId.set(
        row.versionId,
        (pageCountByVersionId.get(row.versionId) ?? 0) + 1,
      );
    }

    return {
      textId,
      total: totalAll,
      successCount: successCountAll,
      errorCount: errorCountAll,
      data: versions.map((v) => ({
        id: v.id,
        version: v.version,
        label: v.label,
        status: v.status,
        progress: v.progress,
        isCurrent: v.isCurrent,
        trigger: v.trigger,
        initiator: v.initiator
          ? {
              id: v.initiator.id,
              name: `${v.initiator.name} ${v.initiator.surname}`.trim(),
            }
          : null,
        tokenCount: countByVersionId.get(v.id) ?? 0,
        unknownCount: unknownByVersionId.get(v.id) ?? 0,
        pageCount: pageCountByVersionId.get(v.id) ?? 0,
        durationMs: v.durationMs,
        errorMessage: v.errorMessage,
        useNormalization: v.useNormalization,
        useMorphAnalysis: v.useMorphAnalysis,
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
      })),
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // VERSIONS — detail
  // ────────────────────────────────────────────────────────────────────────────

  async getVersionDetail(textId: string, versionId: string) {
    const version = await this.prisma.textProcessingVersion.findFirst({
      where: { id: versionId, textId },
      include: {
        initiator: { select: { id: true, name: true, surname: true } },
        logs: { orderBy: { timestamp: "asc" } },
      },
    });
    if (!version) throw new NotFoundException({ code: ErrorCode.TEXT_VERSION_NOT_FOUND, message: "Version not found" });

    // Per-page stats
    const [tokensByPage, wordsByPage, pages] = await Promise.all([
      this.prisma.textToken.groupBy({
        by: ["pageId"],
        where: { versionId, pageId: { not: null } },
        _count: { id: true },
        _min: { position: true },
      }),
      // Words = tokens where normalized is not empty (punctuation normalizes to "")
      this.prisma.textToken.groupBy({
        by: ["pageId"],
        where: { versionId, pageId: { not: null }, normalized: { not: "" } },
        _count: { id: true },
      }),
      this.prisma.textPage.findMany({
        where: { textId },
        orderBy: { pageNumber: "asc" },
        select: { id: true, pageNumber: true, contentRaw: true },
      }),
    ]);

    const tokenCountByPageId = new Map(
      tokensByPage.map((r) => [r.pageId!, r._count.id]),
    );
    const wordCountByPageId = new Map(
      wordsByPage.map((r) => [r.pageId!, r._count.id]),
    );

    const pageStats = pages.map((p) => {
      const tokenCount = tokenCountByPageId.get(p.id) ?? 0;
      const wordCount = wordCountByPageId.get(p.id) ?? 0;
      const charCount = p.contentRaw?.length ?? 0;
      let status: "OK" | "ERROR" | "SKIPPED" = "OK";
      if (version.status === "ERROR") {
        // Pages with no tokens in a failed version were not processed
        status = tokenCount > 0 ? "OK" : "SKIPPED";
      }
      return {
        pageId: p.id,
        pageNumber: p.pageNumber,
        tokenCount,
        wordCount,
        charCount,
        status,
      };
    });

    const totalTokenCount = pageStats.reduce((sum, p) => sum + p.tokenCount, 0);
    const totalWordCount = pageStats.reduce((sum, p) => sum + p.wordCount, 0);
    const totalCharCount = pageStats.reduce((sum, p) => sum + p.charCount, 0);

    return {
      id: version.id,
      version: version.version,
      label: version.label,
      status: version.status,
      progress: version.progress,
      isCurrent: version.isCurrent,
      trigger: version.trigger,
      initiator: version.initiator
        ? {
            id: version.initiator.id,
            name: `${version.initiator.name} ${version.initiator.surname}`.trim(),
          }
        : null,
      durationMs: version.durationMs,
      errorMessage: version.errorMessage,
      useNormalization: version.useNormalization,
      useMorphAnalysis: version.useMorphAnalysis,
      createdAt: version.createdAt,
      updatedAt: version.updatedAt,
      totalTokenCount,
      totalWordCount,
      totalCharCount,
      pages: pageStats,
      logs: version.logs.map((l) => ({
        id: l.id,
        timestamp: l.timestamp,
        level: l.level,
        message: l.message,
      })),
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // VERSIONS — restore
  // ────────────────────────────────────────────────────────────────────────────

  async restoreVersion(textId: string, versionId: string) {
    const version = await this.prisma.textProcessingVersion.findFirst({
      where: { id: versionId, textId },
    });
    if (!version) throw new NotFoundException({ code: ErrorCode.TEXT_VERSION_NOT_FOUND, message: "Version not found" });
    if (version.status !== "COMPLETED") {
      throw new BadRequestException({ code: ErrorCode.TEXT_VERSION_NOT_COMPLETED, message: "Only completed versions can be restored" });
    }
    if (version.isCurrent) return { versionId, restored: true };

    await this.prisma.$transaction([
      this.prisma.textProcessingVersion.updateMany({
        where: { textId },
        data: { isCurrent: false },
      }),
      this.prisma.textProcessingVersion.update({
        where: { id: versionId },
        data: { isCurrent: true },
      }),
    ]);

    return { versionId, restored: true };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // VERSIONS — download
  // ────────────────────────────────────────────────────────────────────────────

  async downloadVersion(textId: string, versionId: string) {
    const version = await this.prisma.textProcessingVersion.findFirst({
      where: { id: versionId, textId },
      include: {
        initiator: { select: { id: true, name: true, surname: true } },
      },
    });
    if (!version) throw new NotFoundException({ code: ErrorCode.TEXT_VERSION_NOT_FOUND, message: "Version not found" });

    const [tokens, pages] = await Promise.all([
      this.prisma.textToken.findMany({
        where: { versionId },
        orderBy: { position: "asc" },
        select: {
          id: true,
          pageId: true,
          position: true,
          original: true,
          normalized: true,
          status: true,
          startOffset: true,
          endOffset: true,
        },
      }),
      this.prisma.textPage.findMany({
        where: { textId },
        orderBy: { pageNumber: "asc" },
        select: { id: true, pageNumber: true, title: true },
      }),
    ]);

    return {
      versionId: version.id,
      version: version.version,
      label: version.label,
      status: version.status,
      createdAt: version.createdAt,
      initiator: version.initiator
        ? `${version.initiator.name} ${version.initiator.surname}`.trim()
        : null,
      pages,
      tokens,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // UNKNOWN WORDS FOR TEXT
  // ────────────────────────────────────────────────────────────────────────────

  async getUnknownWordsForText(textId: string) {
    const text = await this.prisma.text.findUnique({ where: { id: textId } });
    if (!text) throw new NotFoundException({ code: ErrorCode.TEXT_NOT_FOUND, message: "Text not found" });

    const latestVersion = await this.prisma.textProcessingVersion.findFirst({
      where: { textId },
      orderBy: { version: "desc" },
      select: { id: true, version: true },
    });

    if (!latestVersion) {
      return { versionId: null, version: null, items: [], total: 0 };
    }

    const unknownTokens = await this.prisma.textToken.groupBy({
      by: ["normalized"],
      where: { versionId: latestVersion.id, analyses: { none: {} } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });

    return {
      versionId: latestVersion.id,
      version: latestVersion.version,
      items: unknownTokens.map((t) => ({
        word: t.normalized,
        count: t._count.id,
      })),
      total: unknownTokens.length,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // BULK OPERATIONS
  // ────────────────────────────────────────────────────────────────────────────

  async bulkPublish(ids: string[]) {
    const result = await this.prisma.text.updateMany({
      where: { id: { in: ids } },
      data: { publishedAt: new Date(), archivedAt: null },
    });
    return { updated: result.count };
  }

  async bulkUnpublish(ids: string[]) {
    const result = await this.prisma.text.updateMany({
      where: { id: { in: ids } },
      data: { publishedAt: null },
    });
    return { updated: result.count };
  }

  async bulkTokenize(ids: string[]) {
    const texts = await this.prisma.text.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });

    for (const text of texts) {
      void this.tokenizerProcessor
        .processText(text.id, {
          trigger: ProcessingTrigger.MANUAL,
          useNormalization: true,
          useMorphAnalysis: true,
          label: "токенизация",
        })
        .catch(() => undefined);
    }

    return { started: texts.length };
  }

  async bulkDelete(ids: string[]) {
    const texts = await this.prisma.text.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });

    for (const { id } of texts) {
      await this.deleteTextById(id);
    }

    return { deleted: texts.length };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // BULK IMPORT (JSON)
  // ────────────────────────────────────────────────────────────────────────────

  async bulkImport(items: CreateTextDto[], userId: string) {
    const results: BulkImportResultItem[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        const created = await this.addNewText(item, userId);
        results.push({
          index: i,
          status: "ok",
          textId: created.id,
          title: created.title,
        });
      } catch (err) {
        results.push({
          index: i,
          status: "error",
          title: item.title,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const created = results.filter((r) => r.status === "ok").length;
    return {
      total: items.length,
      created,
      failed: items.length - created,
      items: results,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PUBLISH / UNPUBLISH (single)
  // ────────────────────────────────────────────────────────────────────────────

  async publishOne(textId: string) {
    const text = await this.prisma.text.findUnique({ where: { id: textId } });
    if (!text) throw new NotFoundException({ code: ErrorCode.TEXT_NOT_FOUND, message: "Text not found" });
    await this.prisma.text.update({
      where: { id: textId },
      data: { publishedAt: new Date(), archivedAt: null },
    });
    void this.emitNewLibraryText(textId, text.title).catch(() => undefined);
    return { textId, published: true };
  }

  async unpublishOne(textId: string) {
    const text = await this.prisma.text.findUnique({ where: { id: textId } });
    if (!text) throw new NotFoundException({ code: ErrorCode.TEXT_NOT_FOUND, message: "Text not found" });
    await this.prisma.text.update({
      where: { id: textId },
      data: { publishedAt: null },
    });
    return { textId, published: false };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PRIVATE
  // ────────────────────────────────────────────────────────────────────────────

  private async emitNewLibraryText(textId: string, textTitle: string): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { notifications: { inAppNewTexts: true } },
          { notifications: null },
        ],
      },
      select: { id: true },
    });
    for (const user of users) {
      this.eventEmitter.emit(NOTIFICATION_EVENTS.CREATE, {
        userId: user.id,
        type: NotificationType.NEW_LIBRARY_TEXT,
        entityId: textId,
        title: textTitle,
      });
    }
  }

  private async resolveTagIds(
    tx: Prisma.TransactionClient,
    tagIds?: string[],
    tagNames?: string[],
  ): Promise<string[]> {
    const ids: string[] = [...(tagIds ?? [])];
    if (tagNames?.length) {
      for (const raw of tagNames) {
        const name = raw.trim();
        if (!name) continue;
        const tag = await tx.tag.upsert({
          where: { name },
          create: { name },
          update: {},
        });
        ids.push(tag.id);
      }
    }
    return [...new Set(ids)];
  }

  private async deleteTextById(textId: string) {
    await this.prisma.$transaction(async (tx) => {
      const versions = await tx.textProcessingVersion.findMany({
        where: { textId },
        select: { id: true },
      });
      const versionIds = versions.map((v) => v.id);
      await tx.tokenAnalysis.deleteMany({
        where: { token: { versionId: { in: versionIds } } },
      });
      await tx.textToken.deleteMany({
        where: { versionId: { in: versionIds } },
      });
      await tx.textProcessingVersion.deleteMany({ where: { textId } });
      await tx.textPage.deleteMany({ where: { textId } });
      await tx.userTextProgress.deleteMany({ where: { textId } });
      await tx.text.delete({ where: { id: textId } });
    });
  }
}
