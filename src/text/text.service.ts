import { Injectable, NotFoundException } from "@nestjs/common";
import { Language, Level, UserEventType } from "@prisma/client";
import { TokenizerProcessor } from "src/markup-engine/tokenizer/tokenizer.processor";
import { PrismaService } from "src/prisma.service";
import { TextProgressService } from "src/progress/text-progress/text-progress.service";
import { WordProgressService } from "src/progress/word-progress/word-progress.service";

export type TextProgressStatus = "NEW" | "IN_PROGRESS" | "COMPLETED";
export type TextSortOrder = "newest" | "oldest" | "alpha" | "progress" | "length" | "level";

export interface GetTextsQuery {
  languages?: Language[];
  levels?: Level[];
  tagIds?: string[];
  status?: TextProgressStatus;
  orderBy?: TextSortOrder;
  search?: string;
  page?: number;
  limit?: number;
}

const WORDS_PER_MINUTE = 200;
const LEVEL_ORDER: Record<string, number> = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 };
const NEW_TEXT_DAYS = 30;

function calcReadingTime(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
}

function getProgressStatus(percent: number): TextProgressStatus {
  if (percent >= 100) return "COMPLETED";
  if (percent > 0) return "IN_PROGRESS";
  return "NEW";
}

@Injectable()
export class TextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenizerProcessor: TokenizerProcessor,
    private readonly wordProgress: WordProgressService,
    private readonly textProgress: TextProgressService,
  ) {}

  async getAllTags() {
    return this.prisma.tag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  }

  /**
   * Список опубликованных текстов с тегами, фильтрацией, сортировкой, прогрессом и счётчиками.
   */
  async getTexts(query: GetTextsQuery = {}, userId?: string) {
    const {
      languages,
      levels,
      tagIds,
      status,
      orderBy = "newest",
      search,
      page = 1,
      limit = 20,
    } = query;
    const safeLimit = Math.min(50, Math.max(1, limit));
    const safePage = Math.max(1, page);
    const skip = (safePage - 1) * safeLimit;
    const where = {
      publishedAt: { not: null as null | Date },
      ...(languages?.length ? { language: { in: languages } } : {}),
      ...(levels?.length ? { level: { in: levels } } : {}),
      ...(tagIds?.length
        ? { tags: { some: { tagId: { in: tagIds } } } }
        : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" as const } },
              { author: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [texts, total] = await Promise.all([
      this.prisma.text.findMany({
        where,
        include: {
          tags: { include: { tag: { select: { id: true, name: true } } } },
        },
        skip,
        take: safeLimit,
        orderBy: orderBy === "alpha"
          ? { title: "asc" }
          : orderBy === "oldest"
            ? { createdAt: "asc" }
            : { createdAt: "desc" },
      }),
      this.prisma.text.count({ where }),
    ]);

    if (!texts.length) {
      return {
        items: [],
        page: safePage,
        limit: safeLimit,
        counts: { total, new: 0, inProgress: 0, completed: 0 },
      };
    }

    const ids = texts.map((t) => t.id);

    const [versions, userProgressRows, bookmarkRows] = await Promise.all([
      this.prisma.textProcessingVersion.findMany({
        where: { textId: { in: ids } },
        orderBy: { version: "desc" },
        select: { id: true, textId: true },
      }),
      userId
        ? this.prisma.userTextProgress.findMany({
            where: { userId, textId: { in: ids } },
            select: { textId: true, progressPercent: true, lastOpened: true },
          })
        : Promise.resolve([]),
      userId
        ? this.prisma.userTextBookmark.findMany({
            where: { userId, textId: { in: ids } },
            select: { textId: true },
          })
        : Promise.resolve([]),
    ]);

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

    const progressByTextId = new Map(
      (userProgressRows as { textId: string; progressPercent: number; lastOpened: Date | null }[]).map(
        (p) => [p.textId, p],
      ),
    );
    const bookmarkedTextIds = new Set((bookmarkRows as { textId: string }[]).map((b) => b.textId));

    const newThreshold = new Date();
    newThreshold.setDate(newThreshold.getDate() - NEW_TEXT_DAYS);

    let items = texts.map((t) => {
      const versionId = latestVersionIdByTextId.get(t.id);
      const wordCount = versionId ? (countByVersionId.get(versionId) ?? 0) : 0;
      const userProgress = progressByTextId.get(t.id);
      const progressPercent = userProgress?.progressPercent ?? 0;
      const tags = t.tags.map((tt) => tt.tag);
      const isNew = t.publishedAt !== null && t.publishedAt >= newThreshold;
      return {
        ...t,
        tags,
        wordCount,
        readingTime: calcReadingTime(wordCount),
        progressPercent,
        progressStatus: getProgressStatus(progressPercent),
        lastOpened: userProgress?.lastOpened ?? null,
        isNew,
        isFavorite: bookmarkedTextIds.has(t.id),
      };
    });

    // Фильтр по статусу прогресса (только для авторизованных)
    if (status && userId) {
      items = items.filter((item) => item.progressStatus === status);
    }

    // Сортировка по прогрессу, длине и уровню — постобработка
    if (orderBy === "progress" && userId) {
      items.sort((a, b) => b.progressPercent - a.progressPercent);
    } else if (orderBy === "length") {
      items.sort((a, b) => b.wordCount - a.wordCount);
    } else if (orderBy === "level") {
      items.sort((a, b) => {
        const la = a.level ? (LEVEL_ORDER[a.level] ?? 99) : 99;
        const lb = b.level ? (LEVEL_ORDER[b.level] ?? 99) : 99;
        return la - lb;
      });
    }

    // Счётчики по текущей выборке (до фильтра статуса, но с остальными фильтрами)
    const counts = {
      total,
      new: items.filter((i) => i.progressStatus === "NEW").length,
      inProgress: items.filter((i) => i.progressStatus === "IN_PROGRESS").length,
      completed: items.filter((i) => i.progressStatus === "COMPLETED").length,
    };

    // Убираем служебное поле tags из Prisma (TextTag[]), оставляем наш маппинг
    const result = items.map(({ tags, ...rest }) => ({ ...rest, tags }));

    return { items: result, page: safePage, limit: safeLimit, counts };
  }

  /**
   * Тексты в процессе чтения (есть прогресс, но не 100%), отсортированные по lastOpened.
   */
  async getContinueReading(userId: string) {
    const progressRows = await this.prisma.userTextProgress.findMany({
      where: {
        userId,
        progressPercent: { gt: 0, lt: 100 },
      },
      orderBy: { lastOpened: "desc" },
      select: { textId: true, progressPercent: true, lastOpened: true },
    });

    if (!progressRows.length) return [];

    const textIds = progressRows.map((p) => p.textId);

    const [texts, pageCounts, versions] = await Promise.all([
      this.prisma.text.findMany({
        where: { id: { in: textIds }, publishedAt: { not: null } },
        select: {
          id: true,
          title: true,
          level: true,
          language: true,
          author: true,
          imageUrl: true,
          tags: { include: { tag: { select: { id: true, name: true } } } },
        },
      }),
      this.prisma.textPage.groupBy({
        by: ["textId"],
        where: { textId: { in: textIds } },
        _count: { id: true },
      }),
      this.prisma.textProcessingVersion.findMany({
        where: { textId: { in: textIds } },
        orderBy: { version: "desc" },
        select: { id: true, textId: true },
      }),
    ]);

    const textById = new Map(texts.map((t) => [t.id, t]));
    const pageCountByTextId = new Map(pageCounts.map((p) => [p.textId, p._count.id]));

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
    const countByVersionId = new Map(tokenCounts.map((c) => [c.versionId, c._count.id]));

    return progressRows
      .map((p) => {
        const text = textById.get(p.textId);
        if (!text) return null;
        const totalPages = pageCountByTextId.get(p.textId) ?? 0;
        const versionId = latestVersionIdByTextId.get(p.textId);
        const wordCount = versionId ? (countByVersionId.get(versionId) ?? 0) : 0;
        const currentPage = totalPages > 0 ? Math.ceil((p.progressPercent / 100) * totalPages) : 0;
        const tags = text.tags.map((tt) => tt.tag);
        return {
          ...text,
          tags,
          wordCount,
          readingTime: calcReadingTime(wordCount),
          progressPercent: p.progressPercent,
          lastOpened: p.lastOpened,
          currentPage,
          totalPages,
        };
      })
      .filter(Boolean);
  }

  /**
   * Возвращает одну страницу текста с токенами (оптимизация: 1 страница = 1 запрос).
   */
  async getPage(textId: string, pageNumber: number, userId: string | undefined) {
    const text = await this.prisma.text.findUnique({
      where: { id: textId },
      select: {
        id: true,
        title: true,
        level: true,
        language: true,
        author: true,
        source: true,
      },
    });
    if (!text) throw new NotFoundException("Text not found");

    const [page, latestVersion, totalPages] = await Promise.all([
      this.prisma.textPage.findFirst({ where: { textId, pageNumber } }),
      this.prisma.textProcessingVersion.findFirst({
        where: { textId },
        orderBy: { version: "desc" },
        select: { id: true },
      }),
      this.prisma.textPage.count({ where: { textId } }),
    ]);
    if (!page) throw new NotFoundException("Page not found");

    if (!latestVersion) {
      return {
        ...text,
        totalPages,
        wordCount: 0,
        contentRich: page.contentRich,
        tokens: [],
        progress: 0,
        page: {
          id: page.id,
          pageNumber: page.pageNumber,
          title: page.title ?? null,
          contentRich: page.contentRich,
          contentRaw: page.contentRaw,
        },
      };
    }

    const [tokens, wordCount] = await Promise.all([
      this.prisma.textToken.findMany({
        where: { versionId: latestVersion.id, pageId: page.id },
        orderBy: { position: "asc" },
        select: {
          id: true,
          position: true,
          original: true,
          normalized: true,
          status: true,
          vocabId: true,
        },
      }),
      this.prisma.textToken.count({ where: { versionId: latestVersion.id } }),
    ]);

    // Primary lemmaId per token
    const tokenAnalyses = await this.prisma.tokenAnalysis.findMany({
      where: { tokenId: { in: tokens.map((t) => t.id) }, isPrimary: true },
      select: { tokenId: true, lemmaId: true },
    });
    const lemmaIdByTokenId = new Map(
      tokenAnalyses
        .filter((a): a is typeof a & { lemmaId: string } => a.lemmaId !== null)
        .map((a) => [a.tokenId, a.lemmaId]),
    );
    const uniqueLemmaIds = [...new Set(lemmaIdByTokenId.values())];

    if (userId && uniqueLemmaIds.length) {
      await this.wordProgress.registerSeenWords(userId, uniqueLemmaIds);
    }

    // userStatus per lemma
    let userStatusByLemmaId = new Map<string, string>();
    if (userId && uniqueLemmaIds.length) {
      const progressRows = await this.prisma.userWordProgress.findMany({
        where: { userId, lemmaId: { in: uniqueLemmaIds } },
        select: { lemmaId: true, status: true },
      });
      userStatusByLemmaId = new Map(progressRows.map((r) => [r.lemmaId, r.status]));
    }

    if (userId) {
      await this.prisma.userEvent.create({
        data: {
          userId,
          type: UserEventType.OPEN_TEXT,
          metadata: { textId, pageNumber },
        },
      });
    }

    const progress = userId
      ? await this.textProgress.calculateProgress(userId, textId)
      : 0;

    if (userId) {
      await this.prisma.userTextProgress.upsert({
        where: { userId_textId: { userId, textId } },
        update: { progressPercent: progress, lastOpened: new Date() },
        create: { userId, textId, progressPercent: progress, lastOpened: new Date() },
      });
    }

    const tokensWithStatus = tokens.map((t) => {
      const lemmaId = lemmaIdByTokenId.get(t.id) ?? null;
      const userStatus = lemmaId ? (userStatusByLemmaId.get(lemmaId) ?? null) : null;
      return { ...t, lemmaId, userStatus };
    });

    return {
      ...text,
      totalPages,
      wordCount,
      contentRich: page.contentRich,
      tokens: tokensWithStatus,
      progress,
      page: {
        id: page.id,
        pageNumber: page.pageNumber,
        title: page.title ?? null,
        contentRich: page.contentRich,
        contentRaw: page.contentRaw,
      },
    };
  }

  async getTextById(textId: string, userId: string | undefined) {
    const text = await this.prisma.text.findUnique({
      where: { id: textId },
      include: {
        pages: { orderBy: { pageNumber: "asc" } },
        tags: { include: { tag: { select: { id: true, name: true } } } },
      },
    });

    if (!text) throw new NotFoundException("Text not found");

    // Версия + wordCount
    const latestVersion = await this.prisma.textProcessingVersion.findFirst({
      where: { textId },
      orderBy: { version: "desc" },
      select: { id: true },
    });

    const wordCount = latestVersion
      ? await this.prisma.textToken.count({ where: { versionId: latestVersion.id } })
      : 0;

    // lemmaIds всех слов текста
    const analyses = latestVersion
      ? await this.prisma.tokenAnalysis.findMany({
          where: { token: { versionId: latestVersion.id }, isPrimary: true },
          select: { lemmaId: true },
        })
      : [];

    const lemmaIds = [
      ...new Set(analyses.map((a) => a.lemmaId).filter((id): id is string => id !== null)),
    ];

    // Прогресс пользователя + закладка
    const [userProgress, bookmark] = await Promise.all([
      userId
        ? this.prisma.userTextProgress.findUnique({
            where: { userId_textId: { userId, textId } },
            select: { progressPercent: true, lastOpened: true },
          })
        : Promise.resolve(null),
      userId
        ? this.prisma.userTextBookmark.findUnique({
            where: { userId_textId: { userId, textId } },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    const progressPercent = userProgress?.progressPercent ?? 0;
    const lastOpened = userProgress?.lastOpened ?? null;
    const totalPages = text.pages.length;
    const currentPage = totalPages > 0 ? Math.ceil((progressPercent / 100) * totalPages) : 0;

    // Статистика слов из текста по статусам пользователя
    let wordStats = { total: lemmaIds.length, known: 0, learning: 0, new: 0 };
    if (userId && lemmaIds.length) {
      const grouped = await this.prisma.userWordProgress.groupBy({
        by: ["status"],
        where: { userId, lemmaId: { in: lemmaIds } },
        _count: { status: true },
      });
      const map = Object.fromEntries(grouped.map((g) => [g.status, g._count.status]));
      const tracked = (map["KNOWN"] ?? 0) + (map["LEARNING"] ?? 0) + (map["NEW"] ?? 0);
      wordStats = {
        total: lemmaIds.length,
        known: map["KNOWN"] ?? 0,
        learning: map["LEARNING"] ?? 0,
        new: lemmaIds.length - tracked,
      };
    }

    if (userId) {
      await this.wordProgress.registerSeenWords(userId, lemmaIds);
      await this.prisma.userEvent.create({
        data: {
          userId,
          type: UserEventType.OPEN_TEXT,
          metadata: { textId, mode: "full" },
        },
      });
    }

    const progress = userId
      ? await this.textProgress.calculateProgress(userId, textId)
      : 0;

    if (userId) {
      await this.prisma.userTextProgress.upsert({
        where: { userId_textId: { userId, textId } },
        update: { progressPercent: progress, lastOpened: new Date() },
        create: { userId, textId, progressPercent: progress, lastOpened: new Date() },
      });
    }

    const tags = text.tags.map((tt) => tt.tag);

    return {
      id: text.id,
      title: text.title,
      description: text.description ?? null,
      language: text.language,
      level: text.level,
      author: text.author,
      source: text.source,
      imageUrl: text.imageUrl,
      publishedAt: text.publishedAt,
      createdAt: text.createdAt,
      updatedAt: text.updatedAt,
      tags,
      wordCount,
      readingTime: calcReadingTime(wordCount),
      totalPages,
      pages: text.pages.map((p) => ({ id: p.id, pageNumber: p.pageNumber, title: p.title ?? null })),
      progress,
      progressPercent,
      lastOpened,
      currentPage,
      wordStats,
      isFavorite: bookmark !== null,
    };
  }

  async toggleBookmark(textId: string, userId: string): Promise<{ bookmarked: boolean }> {
    const existing = await this.prisma.userTextBookmark.findUnique({
      where: { userId_textId: { userId, textId } },
    });
    if (existing) {
      await this.prisma.userTextBookmark.delete({ where: { id: existing.id } });
      return { bookmarked: false };
    }
    await this.prisma.userTextBookmark.create({ data: { userId, textId } });
    return { bookmarked: true };
  }

  async getBookmarks(userId: string) {
    const rows = await this.prisma.userTextBookmark.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        text: {
          include: {
            tags: { include: { tag: { select: { id: true, name: true } } } },
          },
        },
      },
    });

    if (!rows.length) return [];

    const textIds = rows.map((r) => r.text.id);

    const [versions, pageCounts, progressRows] = await Promise.all([
      this.prisma.textProcessingVersion.findMany({
        where: { textId: { in: textIds } },
        orderBy: { version: "desc" },
        select: { id: true, textId: true },
      }),
      this.prisma.textPage.groupBy({
        by: ["textId"],
        where: { textId: { in: textIds } },
        _count: { id: true },
      }),
      this.prisma.userTextProgress.findMany({
        where: { userId, textId: { in: textIds } },
        select: { textId: true, progressPercent: true },
      }),
    ]);

    const latestVersionIdByTextId = new Map<string, string>();
    for (const v of versions) {
      if (!latestVersionIdByTextId.has(v.textId)) latestVersionIdByTextId.set(v.textId, v.id);
    }
    const versionIds = [...latestVersionIdByTextId.values()];
    const tokenCounts = await this.prisma.textToken.groupBy({
      by: ["versionId"],
      where: { versionId: { in: versionIds } },
      _count: { id: true },
    });
    const countByVersionId = new Map(tokenCounts.map((c) => [c.versionId, c._count.id]));
    const pageCountByTextId = new Map(pageCounts.map((p) => [p.textId, p._count.id]));
    const progressByTextId = new Map(progressRows.map((p) => [p.textId, p.progressPercent]));

    return rows.map((r) => {
      const t = r.text;
      const versionId = latestVersionIdByTextId.get(t.id);
      const wordCount = versionId ? (countByVersionId.get(versionId) ?? 0) : 0;
      return {
        id: t.id,
        title: t.title,
        language: t.language,
        level: t.level,
        author: t.author,
        imageUrl: t.imageUrl,
        tags: t.tags.map((tt) => tt.tag),
        wordCount,
        readingTime: calcReadingTime(wordCount),
        totalPages: pageCountByTextId.get(t.id) ?? 0,
        progressPercent: progressByTextId.get(t.id) ?? 0,
        bookmarkedAt: r.createdAt,
      };
    });
  }

  async getRelatedTexts(textId: string, userId: string | undefined) {
    const text = await this.prisma.text.findUnique({
      where: { id: textId },
      select: {
        language: true,
        level: true,
        tags: { select: { tagId: true } },
      },
    });
    if (!text) throw new NotFoundException("Text not found");

    const tagIds = text.tags.map((t) => t.tagId);

    // Похожие: тот же язык + (тот же уровень ИЛИ общие теги), не включая сам текст
    const candidates = await this.prisma.text.findMany({
      where: {
        publishedAt: { not: null },
        id: { not: textId },
        language: text.language,
        OR: [
          ...(text.level ? [{ level: text.level }] : []),
          ...(tagIds.length ? [{ tags: { some: { tagId: { in: tagIds } } } }] : []),
        ],
      },
      include: {
        tags: { include: { tag: { select: { id: true, name: true } } } },
      },
      take: 6,
      orderBy: { publishedAt: "desc" },
    });

    if (!candidates.length) return [];

    const ids = candidates.map((t) => t.id);
    const versions = await this.prisma.textProcessingVersion.findMany({
      where: { textId: { in: ids } },
      orderBy: { version: "desc" },
      select: { id: true, textId: true },
    });
    const latestVersionIdByTextId = new Map<string, string>();
    for (const v of versions) {
      if (!latestVersionIdByTextId.has(v.textId)) latestVersionIdByTextId.set(v.textId, v.id);
    }
    const versionIds = [...latestVersionIdByTextId.values()];
    const tokenCounts = await this.prisma.textToken.groupBy({
      by: ["versionId"],
      where: { versionId: { in: versionIds } },
      _count: { id: true },
    });
    const countByVersionId = new Map(tokenCounts.map((c) => [c.versionId, c._count.id]));

    const pageCounts = await this.prisma.textPage.groupBy({
      by: ["textId"],
      where: { textId: { in: ids } },
      _count: { id: true },
    });
    const pageCountByTextId = new Map(pageCounts.map((p) => [p.textId, p._count.id]));

    let progressByTextId = new Map<string, number>();
    if (userId) {
      const progressRows = await this.prisma.userTextProgress.findMany({
        where: { userId, textId: { in: ids } },
        select: { textId: true, progressPercent: true },
      });
      progressByTextId = new Map(progressRows.map((p) => [p.textId, p.progressPercent]));
    }

    return candidates.map((t) => {
      const versionId = latestVersionIdByTextId.get(t.id);
      const wordCount = versionId ? (countByVersionId.get(versionId) ?? 0) : 0;
      return {
        id: t.id,
        title: t.title,
        language: t.language,
        level: t.level,
        author: t.author,
        imageUrl: t.imageUrl,
        tags: t.tags.map((tt) => tt.tag),
        wordCount,
        readingTime: calcReadingTime(wordCount),
        totalPages: pageCountByTextId.get(t.id) ?? 0,
        progressPercent: progressByTextId.get(t.id) ?? 0,
      };
    });
  }
}
