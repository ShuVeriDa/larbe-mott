import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import {
  CreatePhrasebookCategoryDto,
  CreatePhrasebookPhraseDto,
  UpdatePhrasebookCategoryDto,
  UpdatePhrasebookPhraseDto,
} from "./dto/phrasebook.dto";

@Injectable()
export class AdminPhrasebookService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Categories ──────────────────────────────────────────────────────────

  async getCategories() {
    return this.prisma.phrasebookCategory.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { phrases: true } } },
    });
  }

  async createCategory(dto: CreatePhrasebookCategoryDto) {
    return this.prisma.phrasebookCategory.create({
      data: {
        emoji: dto.emoji,
        name: dto.name,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateCategory(id: string, dto: UpdatePhrasebookCategoryDto) {
    await this.findCategoryOrThrow(id);
    return this.prisma.phrasebookCategory.update({
      where: { id },
      data: {
        ...(dto.emoji !== undefined ? { emoji: dto.emoji } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  async deleteCategory(id: string) {
    await this.findCategoryOrThrow(id);
    await this.prisma.phrasebookCategory.delete({ where: { id } });
  }

  // ── Phrases ──────────────────────────────────────────────────────────────

  async getPhrases(categoryId?: string) {
    return this.prisma.phrasebookPhrase.findMany({
      where: categoryId ? { categoryId } : undefined,
      orderBy: { sortOrder: "asc" },
      include: {
        words: { orderBy: { position: "asc" } },
        examples: true,
        _count: { select: { saves: true } },
      },
    });
  }

  async createPhrase(dto: CreatePhrasebookPhraseDto) {
    await this.findCategoryOrThrow(dto.categoryId);

    return this.prisma.phrasebookPhrase.create({
      data: {
        categoryId: dto.categoryId,
        original: dto.original,
        transliteration: dto.transliteration,
        translation: dto.translation,
        lang: dto.lang,
        sortOrder: dto.sortOrder ?? 0,
        words: dto.words
          ? {
              create: dto.words.map((w, i) => ({
                original: w.original,
                translation: w.translation,
                position: w.position ?? i,
              })),
            }
          : undefined,
        examples: dto.examples
          ? {
              create: dto.examples.map((e) => ({
                phrase: e.phrase,
                translation: e.translation,
                context: e.context,
              })),
            }
          : undefined,
      },
      include: {
        words: { orderBy: { position: "asc" } },
        examples: true,
      },
    });
  }

  async updatePhrase(id: string, dto: UpdatePhrasebookPhraseDto) {
    await this.findPhraseOrThrow(id);

    if (dto.categoryId) await this.findCategoryOrThrow(dto.categoryId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.words !== undefined) {
        await tx.phrasebookPhraseWord.deleteMany({ where: { phraseId: id } });
      }
      if (dto.examples !== undefined) {
        await tx.phrasebookPhraseExample.deleteMany({ where: { phraseId: id } });
      }

      return tx.phrasebookPhrase.update({
        where: { id },
        data: {
          ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
          ...(dto.original !== undefined ? { original: dto.original } : {}),
          ...(dto.transliteration !== undefined
            ? { transliteration: dto.transliteration }
            : {}),
          ...(dto.translation !== undefined
            ? { translation: dto.translation }
            : {}),
          ...(dto.lang ? { lang: dto.lang } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.words !== undefined
            ? {
                words: {
                  create: dto.words.map((w, i) => ({
                    original: w.original,
                    translation: w.translation,
                    position: w.position ?? i,
                  })),
                },
              }
            : {}),
          ...(dto.examples !== undefined
            ? {
                examples: {
                  create: dto.examples.map((e) => ({
                    phrase: e.phrase,
                    translation: e.translation,
                    context: e.context,
                  })),
                },
              }
            : {}),
        },
        include: {
          words: { orderBy: { position: "asc" } },
          examples: true,
        },
      });
    });
  }

  async deletePhrase(id: string) {
    await this.findPhraseOrThrow(id);
    await this.prisma.phrasebookPhrase.delete({ where: { id } });
  }

  // ── Suggestions ──────────────────────────────────────────────────────────

  async getSuggestions() {
    return this.prisma.phrasebookSuggestion.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, username: true, email: true } },
        category: { select: { id: true, name: true } },
      },
    });
  }

  async deleteSuggestion(id: string) {
    const s = await this.prisma.phrasebookSuggestion.findUnique({ where: { id } });
    if (!s) throw new NotFoundException("Suggestion not found");
    await this.prisma.phrasebookSuggestion.delete({ where: { id } });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async findCategoryOrThrow(id: string) {
    const cat = await this.prisma.phrasebookCategory.findUnique({
      where: { id },
    });
    if (!cat) throw new NotFoundException("Phrasebook category not found");
    return cat;
  }

  private async findPhraseOrThrow(id: string) {
    const phrase = await this.prisma.phrasebookPhrase.findUnique({
      where: { id },
    });
    if (!phrase) throw new NotFoundException("Phrasebook phrase not found");
    return phrase;
  }
}
