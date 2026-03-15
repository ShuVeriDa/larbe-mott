import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CreateEntryDto } from "src/admin/dictionary/dto/create-entry.dto";
import { DictionaryService } from "src/markup-engine/dictionary/dictionary.service";
import { normalizeToken } from "src/markup-engine/tokenizer/tokenizer.utils";
import { PrismaService } from "src/prisma.service";
import { AddToDictionaryDto } from "./dto/add-dictionary.dto";
import { FetchUnknownWordsDto } from "./dto/fetch-unknown-words.dto";

@Injectable()
export class AdminUnknownWordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dictionaryService: DictionaryService,
  ) {}

  async getUnknownWords(query: FetchUnknownWordsDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.UnknownWordWhereInput = {};
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { word: { contains: q, mode: "insensitive" } },
        { normalized: { contains: q, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.unknownWord.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ lastSeen: "desc" }, { seenCount: "desc" }],
      }),
      this.prisma.unknownWord.count({ where }),
    ]);

    const normalizers = items.map((i) => i.normalized);
    const textsByNormalized = await this.getTextsForNormalizedList(normalizers);

    const itemsWithTexts = items.map((item) => ({
      ...item,
      texts: textsByNormalized.get(item.normalized) ?? [],
    }));

    return { items: itemsWithTexts, total, page, limit };
  }

  async getUnknownWordById(id: string) {
    const unknown = await this.prisma.unknownWord.findUnique({
      where: { id },
    });
    if (!unknown) {
      throw new NotFoundException("Unknown word not found");
    }
    const texts = await this.getTextsForNormalizedList([unknown.normalized]);
    return {
      ...unknown,
      texts: texts.get(unknown.normalized) ?? [],
    };
  }

  async addUnknownWordToDictionary(
    id: string,
    dto: AddToDictionaryDto,
    userId: string,
  ) {
    const unknown = await this.prisma.unknownWord.findUnique({
      where: { id },
    });
    if (!unknown) {
      throw new NotFoundException("Unknown word not found");
    }

    const createDto: CreateEntryDto = {
      word: unknown.word,
      normalized: unknown.normalized,
      language: dto.language,
      translation: dto.translation,
      partOfSpeech: dto.partOfSpeech,
      notes: dto.notes,
      forms: dto.forms,
    };
    const lemma = await this.dictionaryService.createEntry(createDto, userId);
    await this.prisma.unknownWord.delete({ where: { id } });
    return { lemma, removedUnknownWordId: id };
  }

  async linkToLemma(id: string, lemmaId: string) {
    const unknown = await this.prisma.unknownWord.findUnique({
      where: { id },
    });
    if (!unknown) {
      throw new NotFoundException("Unknown word not found");
    }

    const lemma = await this.prisma.lemma.findUnique({
      where: { id: lemmaId },
    });
    if (!lemma) {
      throw new NotFoundException("Lemma not found");
    }

    const normalized = normalizeToken(unknown.word);
    await this.prisma.morphForm.upsert({
      where: {
        normalized_lemmaId: { normalized, lemmaId },
      },
      create: {
        form: unknown.word,
        normalized,
        lemmaId,
      },
      update: {},
    });
    await this.prisma.unknownWord.delete({ where: { id } });
    return { lemmaId, removedUnknownWordId: id };
  }

  async remove(id: string) {
    const unknown = await this.prisma.unknownWord.findUnique({
      where: { id },
    });
    if (!unknown) {
      throw new NotFoundException("Unknown word not found");
    }
    await this.prisma.unknownWord.delete({ where: { id } });
    return { deleted: true, id };
  }

  private async getTextsForNormalizedList(
    normalizers: string[],
  ): Promise<Map<string, { id: string; title: string }[]>> {
    if (!normalizers.length) return new Map();

    const tokens = await this.prisma.textToken.findMany({
      where: { normalized: { in: normalizers } },
      select: {
        normalized: true,
        version: { select: { textId: true } },
      },
    });

    const textIdsByNormalized = new Map<string, Set<string>>();
    for (const t of tokens) {
      if (!textIdsByNormalized.has(t.normalized)) {
        textIdsByNormalized.set(t.normalized, new Set());
      }
      textIdsByNormalized.get(t.normalized)!.add(t.version.textId);
    }

    const allTextIds = [...new Set(tokens.map((t) => t.version.textId))];
    const texts = await this.prisma.text.findMany({
      where: { id: { in: allTextIds } },
      select: { id: true, title: true },
    });
    const textMap = new Map(texts.map((t) => [t.id, t]));

    const result = new Map<string, { id: string; title: string }[]>();
    for (const norm of normalizers) {
      const ids = textIdsByNormalized.get(norm);
      result.set(
        norm,
        ids ? [...ids].map((id) => textMap.get(id)!).filter(Boolean) : [],
      );
    }
    return result;
  }
}
