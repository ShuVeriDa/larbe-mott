import { Injectable, NotFoundException } from "@nestjs/common";
import { Language } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { SuggestPhraseDto } from "./dto/suggest-phrase.dto";

@Injectable()
export class PhrasebookService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(userId: string) {
    const [totalPhrases, totalCategories, savedCount] = await Promise.all([
      this.prisma.phrasebookPhrase.count(),
      this.prisma.phrasebookCategory.count(),
      this.prisma.userPhrasebookSave.count({ where: { userId } }),
    ]);

    return { totalPhrases, totalCategories, savedCount };
  }

  async getCategories(userId: string) {
    const categories = await this.prisma.phrasebookCategory.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        _count: { select: { phrases: true } },
      },
    });

    return categories.map((c) => ({
      id: c.id,
      emoji: c.emoji,
      name: c.name,
      sortOrder: c.sortOrder,
      phraseCount: c._count.phrases,
    }));
  }

  async getPhrases(
    userId: string,
    params: {
      categoryId?: string;
      lang?: Language;
      savedOnly?: boolean;
      search?: string;
    },
  ) {
    const { categoryId, lang, savedOnly, search } = params;

    const savedIds = savedOnly
      ? (
          await this.prisma.userPhrasebookSave.findMany({
            where: { userId },
            select: { phraseId: true },
          })
        ).map((s) => s.phraseId)
      : undefined;

    const phrases = await this.prisma.phrasebookPhrase.findMany({
      where: {
        ...(categoryId ? { categoryId } : {}),
        ...(lang ? { lang } : {}),
        ...(savedIds ? { id: { in: savedIds } } : {}),
        ...(search
          ? {
              OR: [
                { original: { contains: search, mode: "insensitive" } },
                { translation: { contains: search, mode: "insensitive" } },
                {
                  transliteration: { contains: search, mode: "insensitive" },
                },
              ],
            }
          : {}),
      },
      orderBy: { sortOrder: "asc" },
      include: {
        words: { orderBy: { position: "asc" } },
        examples: true,
        saves: { where: { userId }, select: { id: true } },
      },
    });

    return phrases.map((p) => ({
      id: p.id,
      categoryId: p.categoryId,
      original: p.original,
      transliteration: p.transliteration,
      translation: p.translation,
      lang: p.lang,
      saved: p.saves.length > 0,
      words: p.words.map((w) => ({
        id: w.id,
        original: w.original,
        translation: w.translation,
        position: w.position,
      })),
      examples: p.examples.map((e) => ({
        id: e.id,
        phrase: e.phrase,
        translation: e.translation,
        context: e.context,
      })),
    }));
  }

  async suggestPhrase(userId: string, dto: SuggestPhraseDto) {
    return this.prisma.phrasebookSuggestion.create({
      data: {
        userId,
        original: dto.original,
        translation: dto.translation,
        lang: dto.lang,
        context: dto.context,
        categoryId: dto.categoryId,
      },
      select: { id: true, original: true, translation: true, lang: true, createdAt: true },
    });
  }

  async toggleSave(userId: string, phraseId: string) {
    const phrase = await this.prisma.phrasebookPhrase.findUnique({
      where: { id: phraseId },
    });
    if (!phrase) throw new NotFoundException("Phrase not found");

    const existing = await this.prisma.userPhrasebookSave.findUnique({
      where: { userId_phraseId: { userId, phraseId } },
    });

    if (existing) {
      await this.prisma.userPhrasebookSave.delete({
        where: { userId_phraseId: { userId, phraseId } },
      });
      return { saved: false };
    }

    await this.prisma.userPhrasebookSave.create({
      data: { userId, phraseId },
    });
    return { saved: true };
  }
}
