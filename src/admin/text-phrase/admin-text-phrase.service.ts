import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Language } from "@prisma/client";
import { ErrorCode } from "src/common/errors/error-codes";
import { PagePhrasesCacheService } from "src/cache/page-phrases-cache.service";
import { PrismaService } from "src/prisma.service";
import {
  CreatePhraseAutoOccurrenceDto,
  CreatePhraseWithOccurrenceDto,
  CreateTextPhraseDto,
  CreateTextPhraseOccurrenceDto,
  UpdateTextPhraseDto,
} from "./dto/text-phrase.dto";

const PAGE_PHRASES_SELECT = {
  id: true,
  original: true,
  translation: true,
  notes: true,
} as const;

@Injectable()
export class AdminTextPhraseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagePhrasesCache: PagePhrasesCacheService,
  ) {}

  // ── Phrases ──────────────────────────────────────────────────────────────

  async listPhrases(language?: Language, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const where = language ? { language } : undefined;

    const [items, total] = await Promise.all([
      this.prisma.textPhrase.findMany({
        where,
        orderBy: { original: "asc" },
        skip,
        take: limit,
        include: { _count: { select: { occurrences: true } } },
      }),
      this.prisma.textPhrase.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getPhraseById(id: string) {
    const phrase = await this.prisma.textPhrase.findUnique({
      where: { id },
      include: {
        occurrences: {
          include: { text: { select: { id: true, title: true } } },
          orderBy: [{ textId: "asc" }, { pageNumber: "asc" }],
        },
      },
    });
    if (!phrase) throw new NotFoundException({ code: ErrorCode.PHRASE_NOT_FOUND, message: "Phrase not found" });
    return phrase;
  }

  async createPhrase(dto: CreateTextPhraseDto) {
    const normalized = dto.original.trim().toLowerCase();
    return this.prisma.textPhrase.create({
      data: {
        original: dto.original.trim(),
        normalized,
        translation: dto.translation,
        language: dto.language,
        notes: dto.notes,
      },
    });
  }

  async updatePhrase(id: string, dto: UpdateTextPhraseDto) {
    const data: Record<string, unknown> = { ...dto };
    if (dto.original) {
      data.normalized = dto.original.trim().toLowerCase();
      data.original = dto.original.trim();
    }
    try {
      const phrase = await this.prisma.textPhrase.update({ where: { id }, data });
      // Invalidate cache for all pages that reference this phrase
      await this.invalidatePhrasePages(id);
      return phrase;
    } catch (e: unknown) {
      if ((e as { code?: string }).code === "P2025") throw new NotFoundException({ code: ErrorCode.PHRASE_NOT_FOUND, message: "Phrase not found" });
      throw e;
    }
  }

  async deletePhrase(id: string) {
    try {
      // Collect affected pages before deletion (cascade will remove occurrences)
      const occurrences = await this.prisma.textPhraseOccurrence.findMany({
        where: { phraseId: id },
        select: { textId: true, pageNumber: true },
      });
      await this.prisma.textPhrase.delete({ where: { id } });
      await Promise.all(
        occurrences.map(o => this.pagePhrasesCache.invalidate(o.textId, o.pageNumber)),
      );
    } catch (e: unknown) {
      if ((e as { code?: string }).code === "P2025") throw new NotFoundException({ code: ErrorCode.PHRASE_NOT_FOUND, message: "Phrase not found" });
      throw e;
    }
  }

  // ── Occurrences ──────────────────────────────────────────────────────────

  // Основной сценарий: из редактора выделяют фразу → создаём/переиспользуем фразу + добавляем вхождение
  async createPhraseWithOccurrence(dto: CreatePhraseWithOccurrenceDto) {
    await this.findTextOrThrow(dto.textId);
    const normalized = dto.original.trim().toLowerCase();

    const { phrase, occurrence } = await this.prisma.$transaction(async tx => {
      const phrase = await tx.textPhrase.upsert({
        where: { normalized_language: { normalized, language: dto.language } },
        create: {
          original: dto.original.trim(),
          normalized,
          translation: dto.translation,
          language: dto.language,
          notes: dto.notes,
        },
        update: {},
      });

      const occurrence = await tx.textPhraseOccurrence.upsert({
        where: {
          phraseId_textId_pageNumber_startTokenPosition: {
            phraseId: phrase.id,
            textId: dto.textId,
            pageNumber: dto.pageNumber,
            startTokenPosition: dto.startTokenPosition,
          },
        },
        create: {
          phraseId: phrase.id,
          textId: dto.textId,
          pageNumber: dto.pageNumber,
          startTokenPosition: dto.startTokenPosition,
          endTokenPosition: dto.endTokenPosition,
        },
        update: {},
      });

      return { phrase, occurrence };
    });

    await this.pagePhrasesCache.invalidate(dto.textId, dto.pageNumber);
    return { phrase, occurrence };
  }

  // Автоматически находит позиции токенов по тексту фразы и создаёт occurrence
  async createPhraseAutoOccurrence(dto: CreatePhraseAutoOccurrenceDto) {
    await this.findTextOrThrow(dto.textId);
    const normalized = dto.original.trim().toLowerCase();

    const [page, version] = await Promise.all([
      this.prisma.textPage.findFirst({
        where: { textId: dto.textId, pageNumber: dto.pageNumber },
        select: { id: true },
      }),
      this.prisma.textProcessingVersion.findFirst({
        where: { textId: dto.textId },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      }),
    ]);

    if (!page) throw new NotFoundException({ code: ErrorCode.TEXT_PAGE_NOT_FOUND, message: "Text page not found" });
    if (!version) throw new NotFoundException({ code: ErrorCode.TEXT_NOT_TOKENIZED, message: "Text has not been tokenized yet" });

    const tokens = await this.prisma.textToken.findMany({
      where: { versionId: version.id, pageId: page.id },
      orderBy: { position: "asc" },
      select: { position: true, original: true, normalized: true },
    });

    const phraseWords = normalized.split(/\s+/);
    let foundStart: number | null = null;
    let foundEnd: number | null = null;

    for (let i = 0; i <= tokens.length - phraseWords.length; i++) {
      let match = true;
      for (let j = 0; j < phraseWords.length; j++) {
        const tok = tokens[i + j];
        if (tok.normalized !== phraseWords[j] && tok.original.toLowerCase() !== phraseWords[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        foundStart = tokens[i].position;
        foundEnd = tokens[i + phraseWords.length - 1].position;
        break;
      }
    }

    if (foundStart === null || foundEnd === null) {
      throw new NotFoundException(
        `Phrase words "${dto.original}" not found in tokenized page ${dto.pageNumber}`,
      );
    }

    const { phrase, occurrence } = await this.prisma.$transaction(async tx => {
      const phrase = await tx.textPhrase.upsert({
        where: { normalized_language: { normalized, language: dto.language } },
        create: {
          original: dto.original.trim(),
          normalized,
          translation: dto.translation,
          language: dto.language,
          notes: dto.notes,
        },
        update: {},
      });

      const occurrence = await tx.textPhraseOccurrence.upsert({
        where: {
          phraseId_textId_pageNumber_startTokenPosition: {
            phraseId: phrase.id,
            textId: dto.textId,
            pageNumber: dto.pageNumber,
            startTokenPosition: foundStart!,
          },
        },
        create: {
          phraseId: phrase.id,
          textId: dto.textId,
          pageNumber: dto.pageNumber,
          startTokenPosition: foundStart!,
          endTokenPosition: foundEnd!,
        },
        update: {},
      });

      return { phrase, occurrence };
    });

    await this.pagePhrasesCache.invalidate(dto.textId, dto.pageNumber);
    return { phrase, occurrence };
  }

  async addOccurrence(phraseId: string, dto: CreateTextPhraseOccurrenceDto) {
    const [phrase] = await Promise.all([
      this.prisma.textPhrase.findUnique({ where: { id: phraseId } }),
      this.findTextOrThrow(dto.textId),
    ]);
    if (!phrase) throw new NotFoundException({ code: ErrorCode.PHRASE_NOT_FOUND, message: "Phrase not found" });

    try {
      const occurrence = await this.prisma.textPhraseOccurrence.create({
        data: {
          phraseId,
          textId: dto.textId,
          pageNumber: dto.pageNumber,
          startTokenPosition: dto.startTokenPosition,
          endTokenPosition: dto.endTokenPosition,
        },
      });
      await this.pagePhrasesCache.invalidate(dto.textId, dto.pageNumber);
      return occurrence;
    } catch (e: unknown) {
      if ((e as { code?: string }).code === "P2002") {
        throw new ConflictException({ code: ErrorCode.PHRASE_OCCURRENCE_ALREADY_EXISTS, message: "This phrase occurrence already exists" });
      }
      throw e;
    }
  }

  async deleteOccurrence(occurrenceId: string) {
    const occ = await this.prisma.textPhraseOccurrence.findUnique({
      where: { id: occurrenceId },
      select: { textId: true, pageNumber: true },
    });
    if (!occ) throw new NotFoundException({ code: ErrorCode.PHRASE_OCCURRENCE_NOT_FOUND, message: "Occurrence not found" });

    await this.prisma.textPhraseOccurrence.delete({ where: { id: occurrenceId } });
    await this.pagePhrasesCache.invalidate(occ.textId, occ.pageNumber);
  }

  // Получить все вхождения фраз для конкретной страницы текста
  async getOccurrencesForPage(textId: string, pageNumber: number) {
    const cached = await this.pagePhrasesCache.get(textId, pageNumber);
    if (cached) return cached;

    const result = await this.prisma.textPhraseOccurrence.findMany({
      where: { textId, pageNumber },
      include: { phrase: { select: PAGE_PHRASES_SELECT } },
      orderBy: { startTokenPosition: "asc" },
    });

    await this.pagePhrasesCache.set(textId, pageNumber, result);
    return result;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async findTextOrThrow(id: string) {
    const text = await this.prisma.text.findUnique({ where: { id }, select: { id: true } });
    if (!text) throw new NotFoundException({ code: ErrorCode.TEXT_NOT_FOUND, message: "Text not found" });
    return text;
  }

  private async invalidatePhrasePages(phraseId: string) {
    const occurrences = await this.prisma.textPhraseOccurrence.findMany({
      where: { phraseId },
      select: { textId: true, pageNumber: true },
    });
    await Promise.all(
      occurrences.map(o => this.pagePhrasesCache.invalidate(o.textId, o.pageNumber)),
    );
  }
}
