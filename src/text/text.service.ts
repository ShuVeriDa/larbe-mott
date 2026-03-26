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
    const { languages, levels, tagIds, status, orderBy = "newest", search } = query;

    const texts = await this.prisma.text.findMany({
      where: {
        publishedAt: { not: null },
        ...(languages?.length ? { language: { in: languages } } : {}),
        ...(levels?.length ? { level: { in: levels } } : {}),
        ...(tagIds?.length
          ? { tags: { some: { tagId: { in: tagIds } } } }
          : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
                { author: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        tags: { include: { tag: { select: { id: true, name: true } } } },
      },
      orderBy: orderBy === "alpha"
        ? { title: "asc" }
        : orderBy === "oldest"
        ? { createdAt: "asc" }
        : { createdAt: "desc" },
    });

    if (!texts.length) {
      return { items: [], counts: { total: 0, new: 0, inProgress: 0, completed: 0 } };
    }

    const ids = texts.map((t) => t.id);

    const [versions, userProgressRows] = await Promise.all([
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
      total: items.length,
      new: items.filter((i) => i.progressStatus === "NEW").length,
      inProgress: items.filter((i) => i.progressStatus === "IN_PROGRESS").length,
      completed: items.filter((i) => i.progressStatus === "COMPLETED").length,
    };

    // Убираем служебное поле tags из Prisma (TextTag[]), оставляем наш маппинг
    const result = items.map(({ tags, ...rest }) => ({ ...rest, tags }));

    return { items: result, counts };
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

    const page = await this.prisma.textPage.findFirst({
      where: { textId, pageNumber },
    });
    if (!page) throw new NotFoundException("Page not found");

    const latestVersion = await this.prisma.textProcessingVersion.findFirst({
      where: { textId },
      orderBy: { version: "desc" },
      select: { id: true },
    });
    if (!latestVersion) {
      return {
        ...text,
        contentRich: page.contentRich,
        tokens: [],
        progress: 0,
        page: {
          id: page.id,
          pageNumber: page.pageNumber,
          contentRich: page.contentRich,
          contentRaw: page.contentRaw,
        },
      };
    }

    const tokens = await this.prisma.textToken.findMany({
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
    });

    const lemmaIds = await this.prisma.tokenAnalysis
      .findMany({
        where: {
          tokenId: { in: tokens.map((t) => t.id) },
          isPrimary: true,
        },
        select: { lemmaId: true },
      })
      .then((rows) => [
        ...new Set(
          rows.map((r) => r.lemmaId).filter((id): id is string => id !== null),
        ),
      ]);
    if (userId && lemmaIds.length) {
      await this.wordProgress.registerSeenWords(userId, lemmaIds);
    }

    if (userId) {
      await this.prisma.userEvent.create({
        data: {
          userId,
          type: UserEventType.OPEN_TEXT,
          metadata: {
            textId,
            pageNumber,
          },
        },
      });
    }

    const progress = userId
      ? await this.textProgress.calculateProgress(userId, textId)
      : 0;

    // ЭТАП 15: ответ «страница текста» — tokens[], contentRich (и дублируем в page для совместимости)
    return {
      ...text,
      contentRich: page.contentRich,
      tokens,
      progress,
      page: {
        id: page.id,
        pageNumber: page.pageNumber,
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

    // получаем lemmaId всех слов текста
    const analyses = await this.prisma.tokenAnalysis.findMany({
      where: {
        token: {
          version: {
            textId,
          },
        },
        isPrimary: true,
      },
      select: {
        lemmaId: true,
      },
    });

    const lemmaIds = [
      ...new Set(
        analyses
          .map((a) => a.lemmaId)
          .filter((id): id is string => id !== null),
      ),
    ];

    if (userId) {
      await this.wordProgress.registerSeenWords(userId, lemmaIds);

      await this.prisma.userEvent.create({
        data: {
          userId,
          type: UserEventType.OPEN_TEXT,
          metadata: {
            textId,
            mode: "full",
          },
        },
      });
    }

    // ЭТАП 11
    const progress = userId
      ? await this.textProgress.calculateProgress(userId, textId)
      : 0;

    const tags = text.tags.map((tt) => tt.tag);

    return {
      ...text,
      tags,
      progress,
    };
  }
}
