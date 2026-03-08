import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { extractTextFromTiptap } from "src/common/utils/extractTextFromTiptap";
import { TokenizerProcessor } from "src/markup-engine/tokenizer/tokenizer.processor";
import { PrismaService } from "src/prisma.service";
import { CreateTextDto } from "./dto/create.dto";

@Injectable()
export class TextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenizerProcessor: TokenizerProcessor,
  ) {}
  async getTexts() {
    return await this.prisma.text.findMany();
  }

  async getTextById(textId: string) {
    const text = await this.prisma.text.findUnique({
      where: { id: textId },
      include: {
        pages: { orderBy: { pageNumber: "asc" } },
        processingVersions: {
          include: {
            tokens: true,
          },
        },
      },
    });

    if (!text) throw new NotFoundException("Text not found");

    return text;
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
}
