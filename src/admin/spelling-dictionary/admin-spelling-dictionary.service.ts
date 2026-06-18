import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ErrorCode } from "src/common/errors/error-codes";
import { PrismaService } from "src/prisma.service";
import { CreateSpellingEntryDto } from "./dto/create-spelling-entry.dto";
import { FetchSpellingEntriesDto } from "./dto/fetch-spelling-entries.dto";
import { UpdateSpellingEntryDto } from "./dto/update-spelling-entry.dto";

@Injectable()
export class AdminSpellingDictionaryService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Public: full list (no pagination, cached on FE for 1h) ─────────────────

  async getAllEntries() {
    return this.prisma.spellingEntry.findMany({
      orderBy: { wrongForm: "asc" },
      select: { id: true, wrongForm: true, correctForm: true, comment: true },
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
      data: { wrongForm, correctForm, comment: dto.comment, createdById: userId },
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
}
