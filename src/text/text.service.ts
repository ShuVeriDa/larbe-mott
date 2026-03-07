import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { extractTextFromTiptap } from "src/common/utils/extractTextFromTiptap";
import { PrismaService } from "src/prisma.service";
import { CreateTextDto } from "./dto/create.dto";

@Injectable()
export class TextService {
  constructor(private readonly prisma: PrismaService) {}
  async getTexts() {
    return await this.prisma.text.findMany();
  }

  async getTextById(textId: string) {
    const text = await this.prisma.text.findFirst({
      where: {
        id: textId,
      },
    });

    if (!text) throw new NotFoundException("Text not found");

    return text;
  }

  async addNewText(dto: CreateTextDto, userId: string) {
    const contentRaw = extractTextFromTiptap(dto.contentRich)
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const textData = {
      title: dto.title,
      language: dto.language,
      level: dto.level,
      author: dto.author,
      source: dto.source,
      contentRich: dto.contentRich as Prisma.InputJsonValue,
      contentRaw,
    };

    console.log({ textData });

    const text = await this.prisma.text.create({
      data: {
        ...textData,
        createdById: userId,
      },
    });

    return text;
  }
}
