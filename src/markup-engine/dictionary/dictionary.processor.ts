import { Injectable } from "@nestjs/common";
import { AnalysisSource, Prisma } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { DictionaryService } from "./dictionary.service";

@Injectable()
export class DictionaryProcessor {
  constructor(
    private prisma: PrismaService,
    private dictionaryService: DictionaryService,
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
    const lemmaMap = await this.dictionaryService.findWords(words);

    const analyses: Prisma.TokenAnalysisCreateManyInput[] = [];

    for (const token of tokens) {
      const item = lemmaMap.get(token.normalized);
      if (!item?.lemmaId) continue;

      analyses.push({
        tokenId: token.id,
        lemmaId: item.lemmaId,
        source: AnalysisSource.ADMIN,
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
