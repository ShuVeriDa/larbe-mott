import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import pLimit from "p-limit";
import { PrismaService } from "src/prisma.service";
import { OnlineDictionaryService } from "./online-dictionary.service";

@Injectable()
export class OnlineDictionaryProcessor {
  constructor(
    private prisma: PrismaService,
    private dictionary: OnlineDictionaryService,
  ) {}

  async analyzeVersion(versionId: string) {
    // 1️⃣ получаем все токены без анализа
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

    if (!tokens.length) return;

    // 2️⃣ normalized → tokenIds
    const tokenMap = new Map<string, string[]>();

    for (const token of tokens) {
      if (!tokenMap.has(token.normalized)) {
        tokenMap.set(token.normalized, []);
      }

      tokenMap.get(token.normalized)!.push(token.id);
    }

    const words = [...tokenMap.keys()];

    const limit = pLimit(5);

    const cacheRows: Prisma.DictionaryCacheCreateManyInput[] = [];
    const analysisRows: Prisma.TokenAnalysisCreateManyInput[] = [];

    // 3️⃣ API lookup (ограниченный параллелизм)
    await Promise.all(
      words.map((word) =>
        limit(async () => {
          const result = await this.dictionary.lookupWord(word);

          if (!result) return;

          cacheRows.push({
            normalized: word,
            translation: result.translation,
          });

          const tokenIds = tokenMap.get(word)!;

          for (const tokenId of tokenIds) {
            analysisRows.push({
              tokenId,
              isPrimary: true,
            });
          }
        }),
      ),
    );

    // 4️⃣ batch insert cache
    if (cacheRows.length) {
      await this.prisma.dictionaryCache.createMany({
        data: cacheRows,
        skipDuplicates: true,
      });
    }

    // 5️⃣ batch insert analyses
    if (analysisRows.length) {
      await this.prisma.tokenAnalysis.createMany({
        data: analysisRows,
        skipDuplicates: true,
      });
    }
  }
}
