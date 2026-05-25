import { Injectable } from "@nestjs/common";
import { AnalysisSource, Language, Prisma } from "@prisma/client";
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
    const version = await this.prisma.textProcessingVersion.findUnique({
      where: { id: versionId },
      select: { text: { select: { language: true } } },
    });

    const language: Language = version?.text?.language ?? Language.CHE;

    const tokens = await this.prisma.textToken.findMany({
      where: { versionId, analyses: { none: {} } },
      select: { id: true, normalized: true },
    });

    if (!tokens.length) return;

    const tokenMap = new Map<string, string[]>();
    for (const token of tokens) {
      if (!tokenMap.has(token.normalized)) tokenMap.set(token.normalized, []);
      tokenMap.get(token.normalized)!.push(token.id);
    }

    const words = [...tokenMap.keys()];
    const limit = pLimit(5);

    const cacheRows: Prisma.DictionaryCacheCreateManyInput[] = [];
    // word → lemmaId (resolved after upsert)
    const wordLemmaMap = new Map<string, string>();

    await Promise.all(
      words.map((word) =>
        limit(async () => {
          const result = await this.dictionary.lookupWord(word, language);
          if (!result) return;

          // Upsert Lemma from dosham data so we have a stable lemmaId
          const lemma = await this.prisma.lemma.upsert({
            where: { normalized_language: { normalized: word, language } },
            create: {
              normalized: word,
              baseForm: result.baseForm ?? word,
              language,
              partOfSpeech: result.grammar ?? null,
              ...(result.doshamId != null && { doshamId: result.doshamId }),
            },
            update: {
              // Keep baseForm and partOfSpeech fresh from online dictionary
              baseForm: result.baseForm ?? word,
              partOfSpeech: result.grammar ?? null,
              ...(result.doshamId != null && { doshamId: result.doshamId }),
            },
            select: { id: true },
          });

          wordLemmaMap.set(word, lemma.id);

          cacheRows.push({
            normalized: word,
            translation: result.translation,
            meanings: (result.meanings ?? []) as unknown as Prisma.InputJsonValue,
            lemmaId: lemma.id,
          });
        }),
      ),
    );

    if (cacheRows.length) {
      await this.prisma.dictionaryCache.createMany({
        data: cacheRows,
        skipDuplicates: true,
      });
      // Update lemmaId on existing cache rows that were skipped by createMany
      for (const row of cacheRows) {
        if (row.lemmaId) {
          await this.prisma.dictionaryCache.updateMany({
            where: { normalized: row.normalized, lemmaId: null },
            data: { lemmaId: row.lemmaId },
          });
        }
      }
    }

    const analysisRows: Prisma.TokenAnalysisCreateManyInput[] = [];
    for (const [word, tokenIds] of tokenMap) {
      const lemmaId = wordLemmaMap.get(word) ?? null;
      for (const tokenId of tokenIds) {
        analysisRows.push({
          tokenId,
          lemmaId,
          source: AnalysisSource.ONLINE,
          isPrimary: true,
        });
      }
    }

    if (analysisRows.length) {
      await this.prisma.tokenAnalysis.createMany({
        data: analysisRows,
        skipDuplicates: true,
      });
    }
  }
}
