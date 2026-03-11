import { Injectable } from "@nestjs/common";
import { AnalysisSource, Prisma } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { AdminDictionaryService } from "./admin-dictionary.service";

@Injectable()
export class AdminDictionaryProcessor {
  constructor(
    private prisma: PrismaService,
    private dictionaryService: AdminDictionaryService,
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

    const dictionaryEntries = await this.dictionaryService.findWords(words);

    const dictionaryMap = new Map<string, any>();

    for (const entry of dictionaryEntries) {
      dictionaryMap.set(entry.normalized, entry);
    }

    const analyses: Prisma.TokenAnalysisCreateManyInput[] = [];

    for (const token of tokens) {
      const entry = dictionaryMap.get(token.normalized);

      if (!entry) continue;

      analyses.push({
        tokenId: token.id,
        lemmaId: entry.lemmaId,
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
