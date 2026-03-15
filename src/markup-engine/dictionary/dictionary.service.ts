import { Injectable } from "@nestjs/common";
import { DictionarySource } from "@prisma/client";
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
  async findWords(words: string[]): Promise<Map<string, { lemmaId: string }>> {
    if (!words.length) return new Map();

    const unique = [...new Set(words)];

    const entries = await this.prisma.dictionaryEntry.findMany({
      where: {
        source: DictionarySource.ADMIN,
        headwords: {
          some: {
            normalized: { in: unique },
          },
        },
      },
      include: { headwords: true },
    });

    const map = new Map<string, { lemmaId: string }>();
    for (const entry of entries) {
      for (const h of entry.headwords) {
        if (h.lemmaId) {
          map.set(h.normalized, { lemmaId: h.lemmaId });
        }
      }
    }
    return map;
  }
}
