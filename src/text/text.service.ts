import { Injectable, NotFoundException } from "@nestjs/common";
import { Language, Level, UserEventType } from "@prisma/client";
import { TokenizerProcessor } from "src/markup-engine/tokenizer/tokenizer.processor";
import { PrismaService } from "src/prisma.service";
import { TextProgressService } from "src/progress/text-progress/text-progress.service";
import { WordProgressService } from "src/progress/word-progress/word-progress.service";

export interface GetTextsQuery {
  languages?: Language[];
  levels?: Level[];
  search?: string;
}

@Injectable()
export class TextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenizerProcessor: TokenizerProcessor,
    private readonly wordProgress: WordProgressService,
    private readonly textProgress: TextProgressService,
  ) {}

  /**
   * Список только опубликованных текстов с количеством слов, фильтрацией, поиском и прогрессом пользователя.
   */
  async getTexts(query: GetTextsQuery = {}, userId?: string) {
    const { languages, levels, search } = query;

    const texts = await this.prisma.text.findMany({
      where: {
        publishedAt: { not: null },
        ...(languages?.length ? { language: { in: languages } } : {}),
        ...(levels?.length ? { level: { in: levels } } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
                { author: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    if (!texts.length) return [];

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

    return texts.map((t) => {
      const versionId = latestVersionIdByTextId.get(t.id);
      const wordCount = versionId ? (countByVersionId.get(versionId) ?? 0) : 0;
      const userProgress = progressByTextId.get(t.id);
      return {
        ...t,
        wordCount,
        progressPercent: userProgress?.progressPercent ?? 0,
        lastOpened: userProgress?.lastOpened ?? null,
      };
    });
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
        return {
          ...text,
          wordCount,
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

    return {
      ...text,
      progress,
    };
  }
}
