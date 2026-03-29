import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TokenStatus, UnknownWordStatus } from "@prisma/client";
import { CreateEntryDto } from "src/admin/dictionary/dto/create-entry.dto";
import { DictionaryService } from "src/markup-engine/dictionary/dictionary.service";
import { normalizeToken } from "src/markup-engine/tokenizer/tokenizer.utils";
import { PrismaService } from "src/prisma.service";
import { AddToDictionaryDto } from "./dto/add-dictionary.dto";
import { BulkDeleteUnknownWordsDto } from "./dto/bulk-delete.dto";
import {
  FetchUnknownWordsDto,
  UnknownWordsSortOrder,
  UnknownWordsTab,
} from "./dto/fetch-unknown-words.dto";

const FREQUENT_THRESHOLD = 5;

@Injectable()
export class AdminUnknownWordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dictionaryService: DictionaryService,
  ) {}

  // ─── Stats ──────────────────────────────────────────────────────────────────

  async getStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalPending, totalAddedToDictionary, totalLinkedToLemma, totalDeleted, todayWords] =
      await this.prisma.$transaction([
        this.prisma.unknownWord.count({
          where: { status: UnknownWordStatus.PENDING },
        }),
        this.prisma.unknownWord.count({
          where: { status: UnknownWordStatus.ADDED_TO_DICTIONARY },
        }),
        this.prisma.unknownWord.count({
          where: { status: UnknownWordStatus.LINKED_TO_LEMMA },
        }),
        this.prisma.unknownWord.count({
          where: { status: UnknownWordStatus.DELETED },
        }),
        this.prisma.unknownWord.findMany({
          where: {
            status: UnknownWordStatus.PENDING,
            lastSeen: { gte: today },
          },
          select: { lastTextId: true },
        }),
      ]);

    const textsToday = new Set(
      todayWords.map((w) => w.lastTextId).filter(Boolean),
    ).size;

    return {
      totalPending,
      totalAddedToDictionary,
      totalLinkedToLemma,
      totalDeleted,
      encounteredToday: todayWords.length,
      textsToday,
    };
  }

  // ─── List ────────────────────────────────────────────────────────────────────

  async getUnknownWords(query: FetchUnknownWordsDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.UnknownWordWhereInput = {
      status: UnknownWordStatus.PENDING,
    };

    // tab filter
    if (query.tab === UnknownWordsTab.FREQUENT) {
      where.seenCount = { gte: FREQUENT_THRESHOLD };
    } else if (query.tab === UnknownWordsTab.RARE) {
      where.seenCount = { lt: FREQUENT_THRESHOLD };
    }

    // search
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { word: { contains: q, mode: "insensitive" } },
        { normalized: { contains: q, mode: "insensitive" } },
      ];
    }

    // filter by source text
    if (query.textId) {
      const textTokens = await this.prisma.textToken.findMany({
        where: {
          status: TokenStatus.NOT_FOUND,
          version: { textId: query.textId },
        },
        select: { normalized: true },
        distinct: ["normalized"],
      });
      const normalizedForms = textTokens.map((t) => t.normalized);
      where.normalized = { in: normalizedForms };
    }

    // sort
    let orderBy: Prisma.UnknownWordOrderByWithRelationInput[];
    switch (query.sort) {
      case UnknownWordsSortOrder.NEWEST_FIRST:
        orderBy = [{ lastSeen: "desc" }];
        break;
      case UnknownWordsSortOrder.ALPHABETICAL:
        orderBy = [{ word: "asc" }];
        break;
      default:
        orderBy = [{ seenCount: "desc" }, { lastSeen: "desc" }];
    }

    // tab counts for UI
    const [items, total, frequentCount, rareCount] = await Promise.all([
      this.prisma.unknownWord.findMany({ where, skip, take: limit, orderBy }),
      this.prisma.unknownWord.count({ where }),
      this.prisma.unknownWord.count({
        where: { ...where, seenCount: { gte: FREQUENT_THRESHOLD } },
      }),
      this.prisma.unknownWord.count({
        where: { ...where, seenCount: { lt: FREQUENT_THRESHOLD } },
      }),
    ]);

    const textsByNormalized = await this.getTextsForNormalizedList(
      items.map((i) => i.normalized),
    );

    const itemsWithTexts = items.map((item) => ({
      ...item,
      texts: textsByNormalized.get(item.normalized) ?? [],
    }));

    return {
      items: itemsWithTexts,
      total,
      page,
      limit,
      tabs: {
        all: total,
        frequent: frequentCount,
        rare: rareCount,
      },
    };
  }

  // ─── Single ──────────────────────────────────────────────────────────────────

  async getUnknownWordById(id: string) {
    const unknown = await this.prisma.unknownWord.findUnique({ where: { id } });
    if (!unknown) throw new NotFoundException("Unknown word not found");

    const texts = await this.getTextsForNormalizedList([unknown.normalized]);
    return { ...unknown, texts: texts.get(unknown.normalized) ?? [] };
  }

  // ─── Contexts ────────────────────────────────────────────────────────────────

  async getContexts(id: string) {
    const unknown = await this.prisma.unknownWord.findUnique({ where: { id } });
    if (!unknown) throw new NotFoundException("Unknown word not found");

    const tokens = await this.prisma.textToken.findMany({
      where: { normalized: unknown.normalized },
      select: {
        id: true,
        original: true,
        position: true,
        startOffset: true,
        endOffset: true,
        version: {
          select: {
            text: { select: { id: true, title: true } },
          },
        },
        page: {
          select: { pageNumber: true, contentRaw: true },
        },
      },
      take: 100,
      orderBy: { position: "asc" },
    });

    const contexts = tokens.map((t) => {
      let snippet: string | null = null;
      if (t.page?.contentRaw && t.startOffset != null && t.endOffset != null) {
        const raw = t.page.contentRaw;
        const from = Math.max(0, t.startOffset - 60);
        const to = Math.min(raw.length, t.endOffset + 60);
        snippet = raw.slice(from, to);
      }
      return {
        tokenId: t.id,
        original: t.original,
        position: t.position,
        snippet,
        textId: t.version.text.id,
        textTitle: t.version.text.title,
        pageNumber: t.page?.pageNumber ?? null,
      };
    });

    return { unknownWord: unknown, total: contexts.length, contexts };
  }

  // ─── Add to dictionary ───────────────────────────────────────────────────────

  async addUnknownWordToDictionary(
    id: string,
    dto: AddToDictionaryDto,
    userId: string,
  ) {
    const unknown = await this.prisma.unknownWord.findUnique({ where: { id } });
    if (!unknown) throw new NotFoundException("Unknown word not found");

    const headword = dto.headword?.trim() || unknown.word;

    const createDto: CreateEntryDto = {
      word: headword,
      normalized: unknown.normalized,
      language: dto.language,
      translation: dto.translation,
      partOfSpeech: dto.partOfSpeech,
      level: dto.level,
      notes: dto.notes,
      forms: dto.forms,
    };
    const lemma = await this.dictionaryService.createEntry(createDto, userId);

    await this.prisma.unknownWord.update({
      where: { id },
      data: {
        status: UnknownWordStatus.ADDED_TO_DICTIONARY,
        resolvedAt: new Date(),
      },
    });

    return { lemma, resolvedUnknownWordId: id };
  }

  // ─── Link to existing lemma ──────────────────────────────────────────────────

  async linkToLemma(id: string, lemmaId: string) {
    const unknown = await this.prisma.unknownWord.findUnique({ where: { id } });
    if (!unknown) throw new NotFoundException("Unknown word not found");

    const lemma = await this.prisma.lemma.findUnique({ where: { id: lemmaId } });
    if (!lemma) throw new NotFoundException("Lemma not found");

    const normalized = normalizeToken(unknown.word);
    await this.prisma.morphForm.upsert({
      where: { normalized_lemmaId: { normalized, lemmaId } },
      create: { form: unknown.word, normalized, lemmaId },
      update: {},
    });

    await this.prisma.unknownWord.update({
      where: { id },
      data: {
        status: UnknownWordStatus.LINKED_TO_LEMMA,
        resolvedAt: new Date(),
      },
    });

    return { lemmaId, resolvedUnknownWordId: id };
  }

  // ─── Delete single ───────────────────────────────────────────────────────────

  async remove(id: string) {
    const unknown = await this.prisma.unknownWord.findUnique({ where: { id } });
    if (!unknown) throw new NotFoundException("Unknown word not found");

    await this.prisma.unknownWord.update({
      where: { id },
      data: { status: UnknownWordStatus.DELETED, resolvedAt: new Date() },
    });

    return { deleted: true, id };
  }

  // ─── Clear all pending ───────────────────────────────────────────────────────

  async clearAll() {
    const result = await this.prisma.unknownWord.updateMany({
      where: { status: UnknownWordStatus.PENDING },
      data: { status: UnknownWordStatus.DELETED, resolvedAt: new Date() },
    });
    return { deleted: result.count };
  }

  // ─── Bulk delete ─────────────────────────────────────────────────────────────

  async bulkDelete(dto: BulkDeleteUnknownWordsDto) {
    const result = await this.prisma.unknownWord.updateMany({
      where: {
        id: { in: dto.ids },
        status: UnknownWordStatus.PENDING,
      },
      data: { status: UnknownWordStatus.DELETED, resolvedAt: new Date() },
    });
    return { deleted: result.count };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

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
