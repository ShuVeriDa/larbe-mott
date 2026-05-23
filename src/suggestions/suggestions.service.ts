import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, SuggestionStatus } from "@prisma/client";
import { PrismaService } from "src/prisma.service";

const EDITABLE_FIELDS = [
  "rawWord",
  "rawWordAlt",
  "rawTranslate",
  "notes",
] as const;

@Injectable()
export class SuggestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    normalized: string,
    rawWord: string,
    currentTranslation: string,
    field: string,
    newValue: string,
    comment?: string,
  ) {
    if (!EDITABLE_FIELDS.includes(field as (typeof EDITABLE_FIELDS)[number])) {
      throw new BadRequestException(
        `Поле "${field}" недоступно для редактирования. Допустимые: ${EDITABLE_FIELDS.join(", ")}`,
      );
    }

    // Upsert DictionaryEntry by rawWord so suggestions always have a target entry
    const entry = await this.prisma.dictionaryEntry.upsert({
      where: { rawWord },
      update: {},
      create: { rawWord, rawTranslate: currentTranslation || rawWord },
    });

    const existing = await this.prisma.suggestion.findFirst({
      where: { userId, entryId: entry.id, field, status: SuggestionStatus.PENDING },
      select: { id: true },
    });
    if (existing) throw new BadRequestException("У вас уже есть ожидающее предложение для этого поля");

    const rawVal = entry[field as keyof typeof entry];
    const oldValue = rawVal != null ? JSON.stringify(rawVal) : null;

    return this.prisma.suggestion.create({
      data: { userId, entryId: entry.id, normalized, field, oldValue, newValue, comment },
    });
  }

  async getMySubmissions(userId: string, limit = 20, offset = 0, status?: SuggestionStatus) {
    const where: Prisma.SuggestionWhereInput = { userId, ...(status && { status }) };
    const [data, total] = await Promise.all([
      this.prisma.suggestion.findMany({
        where,
        include: {
          entry: { select: { id: true, rawWord: true } },
          reviewer: { select: { id: true, name: true, username: true } },
        },
        orderBy: { createdAt: "desc" },
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
  ) {
    const where: Prisma.SuggestionWhereInput = {
      ...(status && { status }),
      ...(q && {
        OR: [
          { entry: { rawWord: { contains: q, mode: "insensitive" } } },
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
          entry: { select: { id: true, rawWord: true } },
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
        entry: { select: { id: true, rawWord: true } },
      },
    });
    if (!s) throw new NotFoundException(`Предложение #${id} не найдено`);
    return s;
  }

  async findAdjacent(id: string, status?: SuggestionStatus) {
    const current = await this.prisma.suggestion.findUnique({
      where: { id },
      select: { createdAt: true },
    });
    if (!current) throw new NotFoundException(`Предложение #${id} не найдено`);

    const statusFilter = status ? { status } : {};

    const [prev, next] = await Promise.all([
      this.prisma.suggestion.findFirst({
        where: { ...statusFilter, createdAt: { lt: current.createdAt } },
        orderBy: { createdAt: "desc" },
        select: { id: true, entry: { select: { rawWord: true } } },
      }),
      this.prisma.suggestion.findFirst({
        where: { ...statusFilter, createdAt: { gt: current.createdAt } },
        orderBy: { createdAt: "asc" },
        select: { id: true, entry: { select: { rawWord: true } } },
      }),
    ]);

    return {
      prev: prev ? { id: prev.id, entry: { word: prev.entry.rawWord } } : null,
      next: next ? { id: next.id, entry: { word: next.entry.rawWord } } : null,
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
    if (!suggestion)
      throw new NotFoundException(`Предложение #${suggestionId} не найдено`);
    if (suggestion.status !== SuggestionStatus.PENDING)
      throw new BadRequestException("Предложение уже рассмотрено");

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
        let parsedValue: unknown;
        try {
          parsedValue = JSON.parse(suggestion.newValue);
        } catch {
          parsedValue = suggestion.newValue;
        }

        // Apply to DictionaryEntry (source of truth for admin dict)
        await tx.dictionaryEntry.update({
          where: { id: suggestion.entryId },
          data: { [suggestion.field]: parsedValue },
        });

        // If translation field changed — propagate to DictionaryCache so readers see it immediately
        if (suggestion.field === "rawTranslate" && suggestion.normalized) {
          await tx.dictionaryCache.upsert({
            where: { normalized: suggestion.normalized },
            update: { translation: String(parsedValue) },
            create: { normalized: suggestion.normalized, translation: String(parsedValue) },
          });
        }
      }

      return updated;
    });
  }
}
