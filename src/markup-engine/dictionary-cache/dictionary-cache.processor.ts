import { Injectable, Logger } from "@nestjs/common";
import { AnalysisSource, Prisma } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { DictionaryCacheService } from "./dictionary-cache.service";

@Injectable()
export class DictionaryCacheProcessor {
  private readonly logger = new Logger(DictionaryCacheProcessor.name);

  constructor(
    private prisma: PrismaService,
    private cacheService: DictionaryCacheService,
  ) {}

  async analyzeVersion(versionId: string) {
    const tokens = await this.prisma.textToken.findMany({
      where: {
        versionId,
        analyses: { none: {} },
      },
      select: {
        id: true,
        normalized: true,
      },
    });

    const words = [...new Set(tokens.map((t) => t.normalized))];

    const cacheMap = await this.cacheService.findMap(words);
    this.logger.log(`DictionaryCache: ${words.length} unique words, ${cacheMap.size} found in cache. Sample: ${words.slice(0,10).join(', ')}`);
    this.logger.log(`DictionaryCache hits: ${[...cacheMap.keys()].join(', ')}`);

    const analyses: Prisma.TokenAnalysisCreateManyInput[] = [];

    for (const token of tokens) {
      const entry = cacheMap.get(token.normalized);

      if (!entry) continue;

      analyses.push({
        tokenId: token.id,
        lemmaId: entry.lemmaId,
        source: AnalysisSource.CACHE,
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
