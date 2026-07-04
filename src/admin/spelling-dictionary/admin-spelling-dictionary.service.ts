import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, SpellingMatchType } from "@prisma/client";
import { ErrorCode } from "src/common/errors/error-codes";
import { PrismaService } from "src/prisma.service";
import { CreateSpellingEntryDto } from "./dto/create-spelling-entry.dto";
import { FetchSpellingEntriesDto } from "./dto/fetch-spelling-entries.dto";
import { FetchSpellingOccurrenceTextsDto } from "./dto/fetch-spelling-occurrence-texts.dto";
import { FetchSpellingOccurrencesDto } from "./dto/fetch-spelling-occurrences.dto";
import { UpdateSpellingEntryDto } from "./dto/update-spelling-entry.dto";

const CONTEXT_CHARS = 60;

// Mirrors src/entities/spelling-dictionary/lib/correct-form.ts on the frontend:
// correctForm can be a JSON-serialized array of { text, superscript } nodes
// (used to render <sup> marks in Tiptap/the reader). Bulk-fix writes the raw
// original string verbatim into contentRaw/contentRich via the plain-text
// token-replace path — it has no way to reconstruct a Tiptap superscript mark,
// so any correctForm using this structured format must never be bulk-applied.
const CORRECT_FORM_MARKER = "__cf__:";

const correctFormHasSuperscript = (value: string): boolean => {
  if (!value.startsWith(CORRECT_FORM_MARKER)) return false;
  try {
    const nodes = JSON.parse(value.slice(CORRECT_FORM_MARKER.length)) as { superscript?: boolean }[];
    return nodes.some((n) => n.superscript);
  } catch {
    return false;
  }
};

const buildNormalizedFilter = (
  wrongForm: string,
  matchType: SpellingMatchType,
): Prisma.StringFilter => {
  switch (matchType) {
    case SpellingMatchType.whole_word:
      return { equals: wrongForm, mode: "insensitive" };
    case SpellingMatchType.prefix:
      return { startsWith: wrongForm, mode: "insensitive" };
    case SpellingMatchType.suffix:
      return { endsWith: wrongForm, mode: "insensitive" };
    case SpellingMatchType.substring:
    default:
      return { contains: wrongForm, mode: "insensitive" };
  }
};

@Injectable()
export class AdminSpellingDictionaryService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Public: full list (no pagination, cached on FE for 1h) ─────────────────

  async getAllEntries() {
    return this.prisma.spellingEntry.findMany({
      orderBy: { wrongForm: "asc" },
      select: { id: true, wrongForm: true, correctForm: true, correctForms: true, matchType: true, comment: true },
    });
  }

  // ─── Admin: paginated list ───────────────────────────────────────────────────

  async getEntries(query: FetchSpellingEntriesDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(200, Math.max(1, query.limit ?? 50));
    const skip = (page - 1) * limit;

    const where: Prisma.SpellingEntryWhereInput = {};
    if (query.search?.trim()) {
      const s = query.search.trim();
      where.OR = [
        { wrongForm: { contains: s, mode: "insensitive" } },
        { correctForm: { contains: s, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.spellingEntry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { wrongForm: "asc" },
        include: { createdBy: { select: { id: true, username: true } } },
      }),
      this.prisma.spellingEntry.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  // ─── Admin: create ───────────────────────────────────────────────────────────

  async createEntry(dto: CreateSpellingEntryDto, userId: string) {
    const wrongForm = dto.wrongForm.toLowerCase().trim();
    const correctForm = dto.correctForm.trim();
    const correctForms = (dto.correctForms ?? []).map(f => f.trim()).filter(Boolean);
    const matchType = dto.matchType ?? SpellingMatchType.substring;

    const existing = await this.prisma.spellingEntry.findUnique({
      where: { wrongForm },
    });
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.SPELLING_ENTRY_ALREADY_EXISTS,
        message: `Entry for "${wrongForm}" already exists`,
      });
    }

    return this.prisma.spellingEntry.create({
      data: { wrongForm, correctForm, correctForms, matchType, comment: dto.comment, createdById: userId },
      include: { createdBy: { select: { id: true, username: true } } },
    });
  }

  // ─── Admin: update ───────────────────────────────────────────────────────────

  async updateEntry(id: string, dto: UpdateSpellingEntryDto) {
    const entry = await this.prisma.spellingEntry.findUnique({ where: { id } });
    if (!entry) {
      throw new NotFoundException({
        code: ErrorCode.SPELLING_ENTRY_NOT_FOUND,
        message: "Spelling entry not found",
      });
    }

    const data: Prisma.SpellingEntryUpdateInput = {};
    if (dto.wrongForm !== undefined) {
      const newWrongForm = dto.wrongForm.toLowerCase().trim();
      if (newWrongForm !== entry.wrongForm) {
        const conflict = await this.prisma.spellingEntry.findUnique({
          where: { wrongForm: newWrongForm },
        });
        if (conflict) {
          throw new ConflictException({
            code: ErrorCode.SPELLING_ENTRY_ALREADY_EXISTS,
            message: `Entry for "${newWrongForm}" already exists`,
          });
        }
        data.wrongForm = newWrongForm;
      }
    }
    if (dto.correctForm !== undefined) data.correctForm = dto.correctForm.trim();
    if (dto.correctForms !== undefined) data.correctForms = dto.correctForms.map(f => f.trim()).filter(Boolean);
    if (dto.matchType !== undefined) data.matchType = dto.matchType;
    if (dto.comment !== undefined) data.comment = dto.comment;

    return this.prisma.spellingEntry.update({
      where: { id },
      data,
      include: { createdBy: { select: { id: true, username: true } } },
    });
  }

  // ─── Admin: delete ───────────────────────────────────────────────────────────

  async deleteEntry(id: string) {
    const entry = await this.prisma.spellingEntry.findUnique({ where: { id } });
    if (!entry) {
      throw new NotFoundException({
        code: ErrorCode.SPELLING_ENTRY_NOT_FOUND,
        message: "Spelling entry not found",
      });
    }
    await this.prisma.spellingEntry.delete({ where: { id } });
    return { deleted: true, id };
  }

  // ─── Admin: occurrences across the library (published + drafts, non-archived) ─

  async findOccurrences(params: {
    wrongForm: string;
    matchType: SpellingMatchType;
    page: number;
    limit: number;
    textIds?: string[];
  }) {
    const page = Math.max(1, params.page);
    const limit = Math.min(200, Math.max(1, params.limit));
    const skip = (page - 1) * limit;

    const where: Prisma.TextTokenWhereInput = {
      normalized: buildNormalizedFilter(params.wrongForm, params.matchType),
      version: { isCurrent: true },
      page: {
        text: {
          archivedAt: null,
          ...(params.textIds?.length ? { id: { in: params.textIds } } : {}),
        },
      },
    };

    const [tokens, total] = await Promise.all([
      this.prisma.textToken.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ pageId: "asc" }, { position: "asc" }],
        include: {
          page: {
            select: {
              id: true,
              pageNumber: true,
              contentRaw: true,
              text: { select: { id: true, title: true } },
            },
          },
        },
      }),
      this.prisma.textToken.count({ where }),
    ]);

    const items = tokens
      .filter((token) => token.page)
      .map((token) => {
        const page = token.page!;
        const contentRaw = page.contentRaw;
        const start = token.startOffset ?? null;
        const end = token.endOffset ?? null;
        const hasOffsets = start !== null && end !== null;

        return {
          id: token.id,
          tokenId: token.id,
          textId: page.text.id,
          textTitle: page.text.title,
          pageNumber: page.pageNumber,
          before: hasOffsets ? contentRaw.slice(Math.max(0, start - CONTEXT_CHARS), start) : "",
          match: hasOffsets ? contentRaw.slice(start, end) : token.original,
          after: hasOffsets ? contentRaw.slice(end, end + CONTEXT_CHARS) : "",
        };
      });

    return { items, total, page, limit };
  }

  async findOccurrenceTexts(params: {
    wrongForm: string;
    matchType: SpellingMatchType;
    search?: string;
  }) {
    return this.prisma.text.findMany({
      where: {
        archivedAt: null,
        ...(params.search?.trim()
          ? { title: { contains: params.search.trim(), mode: "insensitive" } }
          : {}),
        pages: {
          some: {
            tokens: {
              some: {
                normalized: buildNormalizedFilter(params.wrongForm, params.matchType),
                version: { isCurrent: true },
              },
            },
          },
        },
      },
      take: 50,
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    });
  }

  async getOccurrences(id: string, query: FetchSpellingOccurrencesDto) {
    const entry = await this.prisma.spellingEntry.findUnique({ where: { id } });
    if (!entry) {
      throw new NotFoundException({
        code: ErrorCode.SPELLING_ENTRY_NOT_FOUND,
        message: "Spelling entry not found",
      });
    }

    const matchType = query.matchType ?? entry.matchType;

    const result = await this.findOccurrences({
      wrongForm: entry.wrongForm,
      matchType,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      textIds: query.textIds,
    });

    // Bulk-fix replaces the whole matched token text with correctForm — safe only
    // when the applied matchType matches the entire word (substring/whole_word).
    // prefix/suffix matches only part of the word; bulk-replacing the full token
    // would silently overwrite characters outside the matched fragment.
    const matchTypeSupportsBulkFix =
      matchType === SpellingMatchType.substring || matchType === SpellingMatchType.whole_word;

    return {
      ...result,
      canBulkFix:
        entry.correctForms.length <= 1 &&
        matchTypeSupportsBulkFix &&
        !correctFormHasSuperscript(entry.correctForm),
      entry: {
        id: entry.id,
        wrongForm: entry.wrongForm,
        correctForm: entry.correctForm,
        correctForms: entry.correctForms,
        matchType: entry.matchType,
      },
      appliedMatchType: matchType,
    };
  }

  async getOccurrenceTexts(id: string, query: FetchSpellingOccurrenceTextsDto) {
    const entry = await this.prisma.spellingEntry.findUnique({ where: { id } });
    if (!entry) {
      throw new NotFoundException({
        code: ErrorCode.SPELLING_ENTRY_NOT_FOUND,
        message: "Spelling entry not found",
      });
    }

    return this.findOccurrenceTexts({
      wrongForm: entry.wrongForm,
      matchType: entry.matchType,
      search: query.search,
    });
  }
}
