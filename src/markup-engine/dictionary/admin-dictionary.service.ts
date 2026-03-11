import { Injectable } from "@nestjs/common";
import { DictionarySource } from "@prisma/client";
import { PrismaService } from "src/prisma.service";

/** Унифицированный админ-словарь: одна иерархия DictionaryEntry + Headword (source=ADMIN). */
@Injectable()
export class AdminDictionaryService {
  constructor(private prisma: PrismaService) {}

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
