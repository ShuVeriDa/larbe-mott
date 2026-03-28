import { Injectable } from "@nestjs/common";
import { LogLevel, Prisma, ProcessingTrigger } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { DictionaryCacheProcessor } from "../dictionary-cache/dictionary-cache.processor";
import { DictionaryProcessor } from "../dictionary/dictionary.processor";
import { NormalizerService } from "../normalizer/normalizer.service";
import { OnlineDictionaryProcessor } from "../online-dictionary/online-dictionary.processor";
import { UnknownWordProcessor } from "../unknown-word/unknown-word.processor";
import { TokenizerService } from "./tokenizer.service";
import { normalizeToken } from "./tokenizer.utils";

export interface ProcessTextOpts {
  trigger?: ProcessingTrigger;
  initiatorId?: string | null;
  useNormalization?: boolean;
  useMorphAnalysis?: boolean;
  label?: string;
}

@Injectable()
export class TokenizerProcessor {
  constructor(
    private prisma: PrismaService,
    private tokenizerService: TokenizerService,
    private normalizerService: NormalizerService,
    private dictionaryProcessor: DictionaryProcessor,
    private dictionaryCacheProcessor: DictionaryCacheProcessor,
    private onlineDictionaryProcessor: OnlineDictionaryProcessor,
    private unknownWordProcessor: UnknownWordProcessor,
  ) {}

  async processText(textId: string, opts: ProcessTextOpts = {}) {
    const {
      trigger = ProcessingTrigger.MANUAL,
      initiatorId = null,
      useNormalization = true,
      useMorphAnalysis = true,
      label = "токенизация",
    } = opts;

    const startMs = Date.now();
    const logBuffer: { level: LogLevel; message: string; timestamp: Date }[] = [];
    const log = (level: LogLevel, message: string) =>
      logBuffer.push({ level, message, timestamp: new Date() });

    await this.prisma.text.update({
      where: { id: textId },
      data: { processingStatus: "RUNNING", processingProgress: 0, processingError: null },
    });

    let versionId: string | null = null;

    try {
      const pages = await this.prisma.textPage.findMany({
        where: { textId },
        orderBy: { pageNumber: "asc" },
      });

      if (!pages.length) {
        await this.prisma.text.update({
          where: { id: textId },
          data: { processingStatus: "COMPLETED", processingProgress: 100 },
        });
        return;
      }

      const latestVersion = await this.prisma.textProcessingVersion.findFirst({
        where: { textId },
        orderBy: { version: "desc" },
      });
      const versionNumber = (latestVersion?.version ?? 0) + 1;

      const version = await this.prisma.textProcessingVersion.create({
        data: {
          textId,
          version: versionNumber,
          trigger,
          initiatorId,
          label,
          useNormalization,
          useMorphAnalysis,
          status: "RUNNING",
          progress: 0,
        },
      });
      versionId = version.id;

      log("INFO", `Запуск обработки. Версия v${versionNumber}, страниц: ${pages.length}`);

      // ── Tokenization ───────────────────────────────────────────────────────
      let position = 0;
      const tokensToInsert: Prisma.TextTokenCreateManyInput[] = [];

      for (const page of pages) {
        log("INFO", `Страница ${page.pageNumber} — токенизация начата`);
        const tokens = this.tokenizerService.tokenizeWithOffsets(page.contentRaw);
        for (const token of tokens) {
          tokensToInsert.push({
            versionId: version.id,
            pageId: page.id,
            position: position++,
            original: token.value,
            normalized: normalizeToken(token.value),
            startOffset: token.startOffset,
            endOffset: token.endOffset,
          });
        }
        log("OK", `Страница ${page.pageNumber} — токенизирована`);
      }

      await this.prisma.textToken.createMany({ data: tokensToInsert });
      log("OK", `Токенизация завершена. Итого токенов: ${tokensToInsert.length}`);

      await this.updateVersionProgress(version.id, 20);
      await this.prisma.text.update({
        where: { id: textId },
        data: { processingProgress: 20 },
      });

      // ── Normalization ──────────────────────────────────────────────────────
      if (useNormalization) {
        await this.normalizerService.normalizeVersion(version.id);
        log("OK", `Нормализация применена к ${tokensToInsert.length} токенам`);
      } else {
        log("INFO", "Нормализация пропущена (отключена настройкой)");
      }

      await this.updateVersionProgress(version.id, 40);
      await this.prisma.text.update({
        where: { id: textId },
        data: { processingProgress: 40 },
      });

      // ── Morphological analysis ─────────────────────────────────────────────
      if (useMorphAnalysis) {
        log("INFO", "Запуск морфологического анализа");

        await this.dictionaryProcessor.analyzeVersion(version.id);
        await this.updateVersionProgress(version.id, 55);
        await this.prisma.text.update({
          where: { id: textId },
          data: { processingProgress: 55 },
        });

        await this.dictionaryCacheProcessor.analyzeVersion(version.id);
        await this.updateVersionProgress(version.id, 70);
        await this.prisma.text.update({
          where: { id: textId },
          data: { processingProgress: 70 },
        });

        await this.onlineDictionaryProcessor.analyzeVersion(version.id);
        await this.updateVersionProgress(version.id, 80);
        await this.prisma.text.update({
          where: { id: textId },
          data: { processingProgress: 80 },
        });

        await this.unknownWordProcessor.analyzeVersion(version.id);
        await this.updateVersionProgress(version.id, 90);
        await this.prisma.text.update({
          where: { id: textId },
          data: { processingProgress: 90 },
        });

        log("OK", "Морфологический анализ завершён");
      } else {
        log("INFO", "Морфологический анализ пропущен (отключён настройкой)");
        await this.updateVersionProgress(version.id, 90);
        await this.prisma.text.update({
          where: { id: textId },
          data: { processingProgress: 90 },
        });
      }

      // ── Vocabulary index ───────────────────────────────────────────────────
      await this.buildVocabularyIndex(version.id);
      log("OK", "Индекс словаря построен");

      const durationMs = Date.now() - startMs;
      await this.writeLogs(version.id, logBuffer);

      // Mark this version as current, clear previous
      await this.prisma.$transaction([
        this.prisma.textProcessingVersion.updateMany({
          where: { textId, id: { not: version.id } },
          data: { isCurrent: false },
        }),
        this.prisma.textProcessingVersion.update({
          where: { id: version.id },
          data: { status: "COMPLETED", progress: 100, isCurrent: true, durationMs },
        }),
      ]);

      await this.prisma.text.update({
        where: { id: textId },
        data: { processingStatus: "COMPLETED", processingProgress: 100, processingError: null },
      });

      return version;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log("ERROR", `Обработка прервана: ${message}`);

      if (versionId) {
        await this.writeLogs(versionId, logBuffer);
        await this.prisma.textProcessingVersion.update({
          where: { id: versionId },
          data: {
            status: "ERROR",
            progress: 0,
            errorMessage: message,
            durationMs: Date.now() - startMs,
          },
        });
      }

      await this.prisma.text.update({
        where: { id: textId },
        data: { processingStatus: "ERROR", processingError: message },
      });

      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  private async updateVersionProgress(versionId: string, progress: number) {
    await this.prisma.textProcessingVersion.update({
      where: { id: versionId },
      data: { progress },
    });
  }

  private async writeLogs(
    versionId: string,
    buffer: { level: LogLevel; message: string; timestamp: Date }[],
  ) {
    if (!buffer.length) return;
    await this.prisma.textVersionLog.createMany({
      data: buffer.map((l) => ({ versionId, level: l.level, message: l.message, timestamp: l.timestamp })),
    });
  }

  private async buildVocabularyIndex(versionId: string) {
    const uniqueWords = await this.prisma.textToken.findMany({
      where: { versionId },
      select: { normalized: true },
      distinct: ["normalized"],
    });

    const words = uniqueWords.map((w) => w.normalized);
    if (!words.length) return;

    await this.prisma.textVocabulary.createMany({
      data: words.map((word) => ({ versionId, normalized: word })),
      skipDuplicates: true,
    });

    await this.prisma.$executeRaw`
      UPDATE text_token t
      SET "vocabId" = v.id
      FROM text_vocabulary v
      WHERE t."versionId" = ${versionId}
      AND v."versionId" = ${versionId}
      AND t.normalized = v.normalized
    `;

    await this.fillVocabularyLemmaAndTranslation(versionId);
  }

  private async fillVocabularyLemmaAndTranslation(versionId: string) {
    const tokens = await this.prisma.textToken.findMany({
      where: { versionId, vocabId: { not: null } },
      select: {
        vocabId: true,
        analyses: {
          where: { isPrimary: true },
          take: 1,
          select: {
            lemmaId: true,
            lemma: {
              select: {
                headwords: {
                  orderBy: { order: "asc" },
                  take: 1,
                  select: { text: true },
                },
              },
            },
          },
        },
      },
    });

    const vocabData = new Map<
      string,
      { lemmaId: string | null; translation: string | null }
    >();
    for (const t of tokens) {
      const vocabId = t.vocabId!;
      if (vocabData.has(vocabId)) continue;
      const primary = t.analyses[0];
      const lemmaId = primary?.lemmaId ?? null;
      const translation = primary?.lemma?.headwords?.[0]?.text ?? null;
      vocabData.set(vocabId, { lemmaId, translation });
    }

    for (const [vocabId, data] of vocabData) {
      await this.prisma.textVocabulary.update({
        where: { id: vocabId },
        data: { lemmaId: data.lemmaId, translation: data.translation },
      });
    }
  }
}
