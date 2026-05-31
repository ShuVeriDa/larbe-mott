import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, SuggestionStatus } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { ErrorCode } from "src/common/errors/error-codes";

const EDITABLE_FIELDS = [
  "rawWord",
  "rawWordAlt",
  "rawTranslate",
  "notes",
] as const;

export const TEXT_EDITABLE_FIELDS = [
  "title",
  "author",
  "source",
  "description",
  "notes",
] as const;

type SuggestionType = "entry" | "text";

const textInclude = { select: { id: true, title: true } } as const;
const entryInclude = { select: { id: true, rawWord: true } } as const;

@Injectable()
export class SuggestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    field: string,
    newValue: string,
    opts: {
      // entry path
      normalized?: string;
      rawWord?: string;
      currentTranslation?: string;
      entryId?: string;
      // text path
      textId?: string;
      comment?: string;
    },
  ) {
    const { textId, entryId, normalized, rawWord, currentTranslation, comment } = opts;

    if (textId) {
      return this.createTextSuggestion(userId, textId, field, newValue, comment);
    }

    return this.createEntrySuggestion(
      userId,
      field,
      newValue,
      { normalized, rawWord, currentTranslation, entryId },
      comment,
    );
  }

  private async createEntrySuggestion(
    userId: string,
    field: string,
    newValue: string,
    opts: {
      normalized?: string;
      rawWord?: string;
      currentTranslation?: string;
      entryId?: string;
    },
    comment?: string,
  ) {
    if (!EDITABLE_FIELDS.includes(field as (typeof EDITABLE_FIELDS)[number])) {
      throw new BadRequestException({
        code: ErrorCode.SUGGESTION_FIELD_NOT_EDITABLE,
        message: `Field "${field}" is not editable. Allowed: ${EDITABLE_FIELDS.join(", ")}`,
      });
    }

    let entry: { id: string; [key: string]: unknown };

    if (opts.entryId) {
      const found = await this.prisma.dictionaryEntry.findUnique({ where: { id: opts.entryId } });
      if (!found) {
        throw new NotFoundException({
          code: ErrorCode.DICTIONARY_ENTRY_NOT_FOUND,
          message: `DictionaryEntry #${opts.entryId} not found`,
        });
      }
      entry = found as { id: string; [key: string]: unknown };
    } else {
      if (!opts.rawWord) {
        throw new BadRequestException({
          code: ErrorCode.SUGGESTION_NO_TARGET,
          message: "Provide either entryId or rawWord for an entry suggestion",
        });
      }
      entry = (await this.prisma.dictionaryEntry.upsert({
        where: { rawWord: opts.rawWord },
        update: {},
        create: {
          rawWord: opts.rawWord,
          rawTranslate: opts.currentTranslation || opts.rawWord,
        },
      })) as { id: string; [key: string]: unknown };
    }

    const existing = await this.prisma.suggestion.findFirst({
      where: { userId, entryId: entry.id, field, status: SuggestionStatus.PENDING },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException({
        code: ErrorCode.SUGGESTION_PENDING_EXISTS,
        message: "You already have a pending suggestion for this field",
      });
    }

    const rawVal = entry[field];
    const oldValue = rawVal != null ? JSON.stringify(rawVal) : null;

    return this.prisma.suggestion.create({
      data: {
        userId,
        entryId: entry.id,
        normalized: opts.normalized,
        field,
        oldValue,
        newValue,
        comment,
      },
    });
  }

  private async createTextSuggestion(
    userId: string,
    textId: string,
    field: string,
    newValue: string,
    comment?: string,
  ) {
    if (!TEXT_EDITABLE_FIELDS.includes(field as (typeof TEXT_EDITABLE_FIELDS)[number])) {
      throw new BadRequestException({
        code: ErrorCode.SUGGESTION_FIELD_NOT_EDITABLE,
        message: `Field "${field}" is not editable for texts. Allowed: ${TEXT_EDITABLE_FIELDS.join(", ")}`,
      });
    }

    const text = await this.prisma.text.findUnique({ where: { id: textId } });
    if (!text) {
      throw new NotFoundException({
        code: ErrorCode.TEXT_NOT_FOUND,
        message: `Text #${textId} not found`,
      });
    }

    const existing = await this.prisma.suggestion.findFirst({
      where: { userId, textId, field, status: SuggestionStatus.PENDING },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException({
        code: ErrorCode.SUGGESTION_PENDING_EXISTS,
        message: "You already have a pending suggestion for this field",
      });
    }

    const rawVal = (text as Record<string, unknown>)[field];
    const oldValue = rawVal != null ? String(rawVal) : null;

    return this.prisma.suggestion.create({
      data: { userId, textId, field, oldValue, newValue, comment },
    });
  }

  async getMySubmissions(
    userId: string,
    limit = 20,
    offset = 0,
    status?: SuggestionStatus,
    order: "asc" | "desc" = "desc",
  ) {
    const where: Prisma.SuggestionWhereInput = { userId, ...(status && { status }) };
    const [data, total] = await Promise.all([
      this.prisma.suggestion.findMany({
        where,
        include: {
          entry: entryInclude,
          text: textInclude,
          reviewer: { select: { id: true, name: true, username: true } },
        },
        orderBy: { createdAt: order },
        take: limit,
        skip: offset,
      }),
      this.prisma.suggestion.count({ where }),
    ]);
    return { data, meta: { total, limit, offset } };
  }

  async list(
    status?: SuggestionStatus,
    limit = 50,
    offset = 0,
    order: "asc" | "desc" = "desc",
    q?: string,
    type?: SuggestionType,
  ) {
    const typeFilter: Prisma.SuggestionWhereInput =
      type === "entry"
        ? { entryId: { not: null } }
        : type === "text"
          ? { textId: { not: null } }
          : {};

    const where: Prisma.SuggestionWhereInput = {
      ...(status && { status }),
      ...typeFilter,
      ...(q && {
        OR: [
          { entry: { rawWord: { contains: q, mode: "insensitive" } } },
          { text: { title: { contains: q, mode: "insensitive" } } },
          { user: { username: { contains: q, mode: "insensitive" } } },
          { user: { name: { contains: q, mode: "insensitive" } } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.suggestion.findMany({
        where,
        include: {
          user: { select: { id: true, username: true, name: true } },
          entry: entryInclude,
          text: textInclude,
          reviewer: { select: { id: true, username: true, name: true } },
        },
        orderBy: { createdAt: order },
        take: limit,
        skip: offset,
      }),
      this.prisma.suggestion.count({ where }),
    ]);

    return { data, meta: { total, limit, offset } };
  }

  async stats() {
    const rows = await this.prisma.suggestion.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    const counts = Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
    const pending = counts[SuggestionStatus.PENDING] ?? 0;
    const approved = counts[SuggestionStatus.APPROVED] ?? 0;
    const rejected = counts[SuggestionStatus.REJECTED] ?? 0;
    return { total: pending + approved + rejected, pending, approved, rejected };
  }

  async findOne(id: string) {
    const s = await this.prisma.suggestion.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, username: true, name: true } },
        reviewer: { select: { id: true, username: true, name: true } },
        entry: entryInclude,
        text: textInclude,
      },
    });
    if (!s) {
      throw new NotFoundException({
        code: ErrorCode.SUGGESTION_NOT_FOUND,
        message: `Suggestion #${id} not found`,
      });
    }
    return s;
  }

  async findAdjacent(id: string, status?: SuggestionStatus) {
    const current = await this.prisma.suggestion.findUnique({
      where: { id },
      select: { createdAt: true },
    });
    if (!current) {
      throw new NotFoundException({
        code: ErrorCode.SUGGESTION_NOT_FOUND,
        message: `Suggestion #${id} not found`,
      });
    }

    const statusFilter = status ? { status } : {};

    const [prev, next] = await Promise.all([
      this.prisma.suggestion.findFirst({
        where: { ...statusFilter, createdAt: { lt: current.createdAt } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          entry: { select: { rawWord: true } },
          text: { select: { title: true } },
        },
      }),
      this.prisma.suggestion.findFirst({
        where: { ...statusFilter, createdAt: { gt: current.createdAt } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          entry: { select: { rawWord: true } },
          text: { select: { title: true } },
        },
      }),
    ]);

    return {
      prev: prev
        ? { id: prev.id, label: prev.entry?.rawWord ?? prev.text?.title ?? null }
        : null,
      next: next
        ? { id: next.id, label: next.entry?.rawWord ?? next.text?.title ?? null }
        : null,
    };
  }

  async review(
    suggestionId: string,
    reviewerId: string,
    decision: "approve" | "reject",
    reviewComment?: string,
  ) {
    const suggestion = await this.prisma.suggestion.findUnique({
      where: { id: suggestionId },
    });
    if (!suggestion) {
      throw new NotFoundException({
        code: ErrorCode.SUGGESTION_NOT_FOUND,
        message: `Suggestion #${suggestionId} not found`,
      });
    }
    if (suggestion.status !== SuggestionStatus.PENDING) {
      throw new BadRequestException({
        code: ErrorCode.SUGGESTION_ALREADY_REVIEWED,
        message: "Suggestion has already been reviewed",
      });
    }

    const newStatus =
      decision === "approve" ? SuggestionStatus.APPROVED : SuggestionStatus.REJECTED;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.suggestion.update({
        where: { id: suggestionId },
        data: {
          status: newStatus,
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          reviewComment,
        },
      });

      if (decision === "approve") {
        if (suggestion.textId) {
          // Apply field change to Text model
          await tx.text.update({
            where: { id: suggestion.textId },
            data: { [suggestion.field]: suggestion.newValue },
          });
        } else if (suggestion.entryId) {
          let parsedValue: unknown;
          try {
            parsedValue = JSON.parse(suggestion.newValue);
          } catch {
            parsedValue = suggestion.newValue;
          }

          await tx.dictionaryEntry.update({
            where: { id: suggestion.entryId },
            data: { [suggestion.field]: parsedValue },
          });

          // Propagate translation change to DictionaryCache so readers see it immediately
          if (suggestion.field === "rawTranslate" && suggestion.normalized) {
            await tx.dictionaryCache.upsert({
              where: { normalized: suggestion.normalized },
              update: { translation: String(parsedValue) },
              create: {
                normalized: suggestion.normalized,
                translation: String(parsedValue),
              },
            });
          }
        }
      }

      return updated;
    });
  }

  getTextFields() {
    return { fields: [...TEXT_EDITABLE_FIELDS] };
  }
}
