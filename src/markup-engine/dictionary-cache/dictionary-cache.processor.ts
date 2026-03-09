import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { DictionaryCacheService } from "./dictionary-cache.service";

@Injectable()
export class DictionaryCacheProcessor {
  constructor(
    private prisma: PrismaService,
    private cacheService: DictionaryCacheService,
  ) {}

  async analyzeVersion(versionId: string) {
    const tokens = await this.prisma.textToken.findMany({
      where: { versionId },
      select: {
        id: true,
        normalized: true,
      },
    });

    const words = [...new Set(tokens.map((t) => t.normalized))];

    const cacheEntries = await this.cacheService.findWords(words);

    const cacheMap = new Map();

    for (const entry of cacheEntries) {
      cacheMap.set(entry.normalized, entry);
    }

    const analyses: Prisma.TokenAnalysisCreateManyInput[] = [];

    for (const token of tokens) {
      const entry = cacheMap.get(token.normalized);

      if (!entry) continue;

      analyses.push({
        tokenId: token.id,
        lemmaId: entry.lemmaId,
        isPrimary: true,
      });
    }

    if (analyses.length) {
      await this.prisma.tokenAnalysis.createMany({
        data: analyses,
        skipDuplicates: true,
      });
    }
  }
}
