import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { DictionaryCacheProcessor } from "../dictionary-cache/dictionary-cache.processor";
import { AdminDictionaryProcessor } from "../dictionary/admin-dictionary.processor";
import { NormalizerService } from "../normalizer/normalizer.service";
import { OnlineDictionaryProcessor } from "../online-dictionary/online-dictionary.processor";
import { UnknownWordProcessor } from "../unknown-word/unknown-word.processor";
import { TokenizerService } from "./tokenizer.service";
import { normalizeToken } from "./tokenizer.utils";

@Injectable()
export class TokenizerProcessor {
  constructor(
    private prisma: PrismaService,
    private tokenizerService: TokenizerService,
    private normalizerService: NormalizerService,
    private adminDictionaryProcessor: AdminDictionaryProcessor,
    private dictionaryCacheProcessor: DictionaryCacheProcessor,
    private onlineDictionaryProcessor: OnlineDictionaryProcessor,
    private unknownWordProcessor: UnknownWordProcessor,
  ) {}

  async processText(textId: string) {
    const pages = await this.prisma.textPage.findMany({
      where: { textId },
      orderBy: { pageNumber: "asc" },
    });

    if (!pages.length) return;

    const latestVersion = await this.prisma.textProcessingVersion.findFirst({
      where: { textId },
      orderBy: { version: "desc" },
    });

    const versionNumber = (latestVersion?.version ?? 0) + 1;

    const version = await this.prisma.textProcessingVersion.create({
      data: {
        textId,
        version: versionNumber,
      },
    });

    let position = 0;

    const tokensToInsert: Prisma.TextTokenCreateManyInput[] = [];

    for (const page of pages) {
      const tokens = this.tokenizerService.tokenize(page.contentRaw);

      for (const token of tokens) {
        tokensToInsert.push({
          versionId: version.id,
          position: position++,
          original: token.value,
          normalized: normalizeToken(token.value),
        });
      }
    }

    await this.prisma.textToken.createMany({
      data: tokensToInsert,
    });

    await this.normalizerService.normalizeVersion(version.id);
    await this.adminDictionaryProcessor.analyzeVersion(version.id);
    await this.dictionaryCacheProcessor.analyzeVersion(version.id);
    await this.onlineDictionaryProcessor.analyzeVersion(version.id);
    await this.unknownWordProcessor.analyzeVersion(version.id);
    await this.buildVocabularyIndex(version.id);

    return version;
  }

  private async buildVocabularyIndex(versionId: string) {
    const uniqueWords = await this.prisma.textToken.findMany({
      where: { versionId },
      select: { normalized: true },
      distinct: ["normalized"],
    });

    return uniqueWords.map((w) => w.normalized);
  }
}
