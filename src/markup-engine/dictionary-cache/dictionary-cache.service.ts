import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";

@Injectable()
export class DictionaryCacheService {
  constructor(private prisma: PrismaService) {}

  async findWords(words: string[]) {
    return this.prisma.dictionaryCache.findMany({
      where: {
        normalized: { in: words },
      },
    });
  }

  async findMap(words: string[]) {
    const unique = [...new Set(words)];

    const rows = await this.prisma.dictionaryCache.findMany({
      where: {
        normalized: { in: unique },
      },
    });

    const map = new Map<string, (typeof rows)[number]>();

    for (const row of rows) {
      map.set(row.normalized, row);
    }

    return map;
  }
}
