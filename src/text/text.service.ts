import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { extractTextFromTiptap } from "src/common/utils/extractTextFromTiptap";
import { TokenizerProcessor } from "src/markup-engine/tokenizer/tokenizer.processor";
import { PrismaService } from "src/prisma.service";
import { TextProgressService } from "src/progress/text-progress/text-progress.service";
import { WordProgressService } from "src/progress/word-progress/word-progress.service";
import { CreateTextDto } from "./dto/create.dto";
import { PatchTextDto } from "./dto/update.dto";

@Injectable()
export class TextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenizerProcessor: TokenizerProcessor,
    private readonly wordProgress: WordProgressService,
    private readonly textProgress: TextProgressService,
  ) {}
  async getTexts() {
    return await this.prisma.text.findMany();
  }

  /**
   * Возвращает одну страницу текста с токенами (оптимизация: 1 страница = 1 запрос).
   */
  async getPage(
    textId: string,
    pageNumber: number,
    userId: string,
  ) {
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

    const lemmaIds = await this.prisma.tokenAnalysis.findMany({
      where: {
        tokenId: { in: tokens.map((t) => t.id) },
        isPrimary: true,
      },
      select: { lemmaId: true },
    }).then((rows) =>
      [...new Set(rows.map((r) => r.lemmaId).filter((id): id is string => id !== null))],
    );
    if (lemmaIds.length) {
      await this.wordProgress.registerSeenWords(userId, lemmaIds);
    }

    const progress = await this.textProgress.calculateProgress(userId, textId);

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

  async getTextById(textId: string, userId: string) {
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

    await this.wordProgress.registerSeenWords(userId, lemmaIds);

    // ЭТАП 11
    const progress = await this.textProgress.calculateProgress(userId, textId);

    return {
      ...text,
      progress,
    };
  }

  async addNewText(dto: CreateTextDto, userId: string) {
    const text = await this.prisma.$transaction(async (tx) => {
      const created = await tx.text.create({
        data: {
          title: dto.title,
          language: dto.language,
          level: dto.level,
          author: dto.author,
          source: dto.source,
          createdById: userId,
        },
      });

      for (const page of dto.pages) {
        const contentRaw = extractTextFromTiptap(page.contentRich);

        await tx.textPage.create({
          data: {
            textId: created.id,
            pageNumber: page.pageNumber,
            contentRich: page.contentRich as Prisma.InputJsonValue,
            contentRaw,
          },
        });
      }

      return tx.text.findUniqueOrThrow({
        where: { id: created.id },
        include: { pages: true },
      });
    });

    await this.tokenizerProcessor.processText(text.id);

    return text;
  }

  async patchText(textId: string, dto: PatchTextDto) {
    const text = await this.prisma.text.findUnique({
      where: { id: textId },
      include: { pages: true },
    });
    if (!text) throw new NotFoundException("Text not found");

    const updated = await this.prisma.$transaction(async (tx) => {
      const textData: Parameters<typeof tx.text.update>[0]["data"] = {};
      if (dto.title !== undefined) textData.title = dto.title;
      if (dto.language !== undefined) textData.language = dto.language;
      if (dto.level !== undefined) textData.level = dto.level;
      if (dto.author !== undefined) textData.author = dto.author;
      if (dto.source !== undefined) textData.source = dto.source;

      if (Object.keys(textData).length > 0) {
        await tx.text.update({
          where: { id: textId },
          data: textData,
        });
      }

      if (dto.pages !== undefined) {
        await tx.textPage.deleteMany({ where: { textId } });
        for (const page of dto.pages) {
          const contentRaw = extractTextFromTiptap(page.contentRich);
          await tx.textPage.create({
            data: {
              textId,
              pageNumber: page.pageNumber,
              contentRich: page.contentRich as Prisma.InputJsonValue,
              contentRaw,
            },
          });
        }
      }

      return tx.text.findUniqueOrThrow({
        where: { id: textId },
        include: { pages: { orderBy: { pageNumber: "asc" } } },
      });
    });

    if (dto.pages !== undefined) {
      await this.tokenizerProcessor.processText(updated.id);
    }

    return updated;
  }

  async deleteText(textId: string) {
    const text = await this.prisma.text.findUnique({
      where: { id: textId },
    });
    if (!text) throw new NotFoundException("Text not found");

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
