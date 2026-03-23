import { Injectable, NotFoundException } from "@nestjs/common";
import { DictionarySource, Language, Prisma } from "@prisma/client";
import { PatchEntryDto } from "src/admin/dictionary/dto/update-entry.dto";
import { PrismaService } from "src/prisma.service";
import { CreateEntryDto } from "../../admin/dictionary/dto/create-entry.dto";
import { normalizeToken } from "../tokenizer/tokenizer.utils";

/** Унифицированный админ-словарь: одна иерархия DictionaryEntry + Headword (source=ADMIN). */
@Injectable()
export class DictionaryService {
  constructor(private prisma: PrismaService) {}

  /**
   * Создаёт запись в словаре (лемма, entry, headword, формы).
   */
  async createEntry(dto: CreateEntryDto, userId: string) {
    const normalized = normalizeToken(dto.word);

    return this.prisma.$transaction(async (tx) => {
      let lemma = await tx.lemma.findUnique({
        where: {
          normalized_language: {
            normalized,
            language: dto.language,
          },
        },
      });

      if (!lemma) {
        lemma = await tx.lemma.create({
          data: {
            baseForm: dto.word,
            normalized,
            language: dto.language,
            partOfSpeech: dto.partOfSpeech ?? null,
          },
        });
      }

      const entry = await tx.dictionaryEntry.create({
        data: {
          rawWord: dto.word,
          rawTranslate: dto.translation,
          source: DictionarySource.ADMIN,
          createdById: userId,
          notes: dto.notes ?? null,
        },
      });

      await tx.headword.create({
        data: {
          entryId: entry.id,
          text: dto.word,
          normalized,
          lemmaId: lemma.id,
          order: 0,
        },
      });

      if (dto.forms?.length) {
        await tx.morphForm.createMany({
          data: dto.forms.map((form) => ({
            form,
            normalized: normalizeToken(form),
            lemmaId: lemma.id,
          })),
          skipDuplicates: true,
        });
      }

      return lemma;
    });
  }

  /**
   * Ищет слова в админском словаре (DictionaryEntry с source=ADMIN).
   * Возвращает карту: normalized -> { lemmaId } для использования в пайплайне.
   */
  async findWords(words: string[], language?: Language): Promise<Map<string, { lemmaId: string }>> {
    if (!words.length) return new Map();

    const unique = [...new Set(words)];

    const entries = await this.prisma.dictionaryEntry.findMany({
      where: {
        source: DictionarySource.ADMIN,
        headwords: {
          some: {
            normalized: { in: unique },
            ...(language ? { lemma: { language } } : {}),
          },
        },
      },
      include: {
        headwords: {
          include: { lemma: { select: { language: true } } },
        },
      },
    });

    const map = new Map<string, { lemmaId: string }>();
    for (const entry of entries) {
      for (const h of entry.headwords) {
        if (h.lemmaId && (!language || h.lemma?.language === language)) {
          map.set(h.normalized, { lemmaId: h.lemmaId });
        }
      }
    }
    return map;
  }

  /**
   * Список записей админ-словаря с поиском и пагинацией.
   */
  async getListForAdmin(params: {
    q?: string;
    language?: Language;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.LemmaWhereInput = {
      headwords: {
        some: {
          entry: { source: DictionarySource.ADMIN },
        },
      },
    };
    if (params.language) {
      where.language = params.language;
    }
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { normalized: { contains: q, mode: "insensitive" } },
        { baseForm: { contains: q, mode: "insensitive" } },
      ];
    }

    const [lemmas, total] = await Promise.all([
      this.prisma.lemma.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ language: "asc" }, { normalized: "asc" }],
        include: {
          headwords: {
            where: { entry: { source: DictionarySource.ADMIN } },
            include: { entry: { select: { rawTranslate: true } } },
            take: 1,
          },
          _count: { select: { morphForms: true } },
        },
      }),
      this.prisma.lemma.count({ where }),
    ]);

    const items = lemmas.map((l) => {
      const translation = l.headwords[0]?.entry?.rawTranslate ?? "";
      return {
        id: l.id,
        baseForm: l.baseForm,
        normalized: l.normalized,
        language: l.language,
        partOfSpeech: l.partOfSpeech,
        translation,
        formsCount: l._count.morphForms,
      };
    });

    return { items, total, page, limit };
  }

  /**
   * Карточка записи по id леммы (лемма, перевод, формы).
   */
  async getCardForAdmin(lemmaId: string) {
    const lemma = await this.prisma.lemma.findFirst({
      where: {
        id: lemmaId,
        headwords: {
          some: { entry: { source: DictionarySource.ADMIN } },
        },
      },
      include: {
        headwords: {
          where: { entry: { source: DictionarySource.ADMIN } },
          include: {
            entry: {
              select: {
                id: true,
                rawWord: true,
                rawTranslate: true,
                notes: true,
              },
            },
          },
        },
        morphForms: { select: { id: true, form: true, normalized: true } },
      },
    });
    if (!lemma) throw new NotFoundException("Dictionary entry not found");
    const entry = lemma.headwords[0]?.entry;
    return {
      id: lemma.id,
      baseForm: lemma.baseForm,
      normalized: lemma.normalized,
      language: lemma.language,
      partOfSpeech: lemma.partOfSpeech,
      translation: entry?.rawTranslate ?? null,
      notes: entry?.notes ?? null,
      entryId: entry?.id ?? null,
      forms: lemma.morphForms,
    };
  }

  /**
   * Обновить запись: лемма, перевод/заметки, формы.
   */
  async updateEntry(lemmaId: string, dto: PatchEntryDto) {
    return this.prisma.$transaction(async (tx) => {
      const lemma = await tx.lemma.findFirst({
        where: {
          id: lemmaId,
          headwords: {
            some: { entry: { source: DictionarySource.ADMIN } },
          },
        },
        include: {
          headwords: {
            where: { entry: { source: DictionarySource.ADMIN } },
            include: { entry: true },
          },
        },
      });
      if (!lemma) throw new NotFoundException("Dictionary entry not found");

      if (dto.baseForm !== undefined || dto.partOfSpeech !== undefined) {
        await tx.lemma.update({
          where: { id: lemmaId },
          data: {
            ...(dto.baseForm !== undefined && {
              baseForm: dto.baseForm,
              normalized: normalizeToken(dto.baseForm),
            }),
            ...(dto.partOfSpeech !== undefined && {
              partOfSpeech: dto.partOfSpeech,
            }),
          },
        });
      }

      const entry = lemma.headwords[0]?.entry;
      if (entry && (dto.translation !== undefined || dto.notes !== undefined)) {
        await tx.dictionaryEntry.update({
          where: { id: entry.id },
          data: {
            ...(dto.translation !== undefined && {
              rawTranslate: dto.translation,
            }),
            ...(dto.notes !== undefined && { notes: dto.notes }),
          },
        });
      }

      if (dto.forms !== undefined) {
        await tx.morphForm.deleteMany({ where: { lemmaId } });
        if (dto.forms.length > 0) {
          await tx.morphForm.createMany({
            data: dto.forms.map((form) => ({
              form,
              normalized: normalizeToken(form),
              lemmaId,
            })),
            skipDuplicates: true,
          });
        }
      }
    });

    return await this.getCardForAdmin(lemmaId);
  }
}
