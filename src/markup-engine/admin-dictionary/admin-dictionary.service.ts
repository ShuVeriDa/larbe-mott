import { Injectable } from "@nestjs/common";
import { DictionarySource } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { normalizeToken } from "../tokenizer/tokenizer.utils";
import { CreateEntryDto } from "./dto/create-entry.dto";

@Injectable()
export class AdminDictionaryService {
  constructor(private prisma: PrismaService) {}

  async createEntry(dto: CreateEntryDto, userId: string) {
    const normalized = normalizeToken(dto.word);

    return this.prisma.$transaction(async (tx) => {
      // 1️⃣ ищем существующую lemma
      let lemma = await tx.lemma.findUnique({
        where: {
          normalized_language: {
            normalized,
            language: dto.language,
          },
        },
      });

      // 2️⃣ если нет — создаём
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

      // 3️⃣ создаём dictionary entry (унифицированная иерархия: DictionaryEntry + Headword)
      const entry = await tx.dictionaryEntry.create({
        data: {
          rawWord: dto.word,
          rawTranslate: dto.translation,
          source: DictionarySource.ADMIN,
          createdById: userId,
          notes: dto.notes ?? null,
        },
      });

      // 4️⃣ создаём headword
      await tx.headword.create({
        data: {
          entryId: entry.id,
          text: dto.word,
          normalized,
          lemmaId: lemma.id,
          order: 0,
        },
      });

      // 5️⃣ формы слова
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
}
