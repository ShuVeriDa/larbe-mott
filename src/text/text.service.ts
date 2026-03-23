import { Injectable, NotFoundException } from "@nestjs/common";
import { UserEventType } from "@prisma/client";
import { TokenizerProcessor } from "src/markup-engine/tokenizer/tokenizer.processor";
import { PrismaService } from "src/prisma.service";
import { TextProgressService } from "src/progress/text-progress/text-progress.service";
import { WordProgressService } from "src/progress/word-progress/word-progress.service";

@Injectable()
export class TextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenizerProcessor: TokenizerProcessor,
    private readonly wordProgress: WordProgressService,
    private readonly textProgress: TextProgressService,
  ) {}
  /**
   * Список только опубликованных текстов с количеством слов (по токенам последней версии).
   */
  async getTexts() {
    const texts = await this.prisma.text.findMany({
      where: { publishedAt: { not: null } },
      orderBy: { createdAt: "desc" },
    });
    if (!texts.length) return [];
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
    return texts.map((t) => {
      const versionId = latestVersionIdByTextId.get(t.id);
      const wordCount = versionId ? (countByVersionId.get(versionId) ?? 0) : 0;
      return { ...t, wordCount };
    });
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
