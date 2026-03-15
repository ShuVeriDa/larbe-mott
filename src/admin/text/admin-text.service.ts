import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CreateTextDto } from "src/admin/text/dto/create.dto";
import { PatchTextDto } from "src/admin/text/dto/update.dto";
import { extractTextFromTiptap } from "src/common/utils/extractTextFromTiptap";
import { TokenizerProcessor } from "src/markup-engine/tokenizer/tokenizer.processor";
import { PrismaService } from "src/prisma.service";
import { TextProgressService } from "src/progress/text-progress/text-progress.service";
import { WordProgressService } from "src/progress/word-progress/word-progress.service";

@Injectable()
export class AdminTextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenizerProcessor: TokenizerProcessor,
    private readonly wordProgress: WordProgressService,
    private readonly textProgress: TextProgressService,
  ) {}

  /**
   * Список всех текстов для админки: с wordCount и publishedAt (черновик = null).
   */
  async getTextsForAdmin() {
    const texts = await this.prisma.text.findMany({
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
      const wordCount = versionId
        ? countByVersionId.get(versionId) ?? 0
        : 0;
      return { ...t, wordCount };
    });
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
          publishedAt: null,
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
      if (dto.publishedAt !== undefined) {
        textData.publishedAt =
          dto.publishedAt === null || dto.publishedAt === ""
            ? null
            : new Date(dto.publishedAt);
      }

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
