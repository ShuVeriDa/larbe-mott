import { Injectable, Optional } from "@nestjs/common";
import { AnalysisSource, LogLevel, Prisma, ProcessingTrigger } from "@prisma/client";
import { TokenizationEventsService } from "src/admin/tokenization/tokenization-events.service";
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
    @Optional() private readonly eventsService?: TokenizationEventsService,
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
    console.log(`[TOKENIZER] processText started: textId=${textId}, useMorphAnalysis=${useMorphAnalysis}`);
    const logBuffer: { level: LogLevel; message: string; timestamp: Date }[] = [];
    const log = (level: LogLevel, message: string) =>
      logBuffer.push({ level, message, timestamp: new Date() });

    await this.prisma.text.update({
      where: { id: textId },
      data: { processingStatus: "RUNNING", processingProgress: 0, processingError: null },
    });
    this.eventsService?.emit("status_change", { textId, status: "RUNNING", progress: 0 });

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
        this.eventsService?.emit("status_change", { textId, status: "COMPLETED", progress: 100 });
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

      await this._updateProgress(textId, version.id, 20);

      // ── Normalization ──────────────────────────────────────────────────────
      if (useNormalization) {
        await this.normalizerService.normalizeVersion(version.id);
        log("OK", `Нормализация применена к ${tokensToInsert.length} токенам`);
      } else {
        log("INFO", "Нормализация пропущена (отключена настройкой)");
      }

      await this._updateProgress(textId, version.id, 40);

      // ── Morphological analysis ─────────────────────────────────────────────
      // Note: MorphologyRuleEngine (suffix stripping, CHE-only) is intentionally
      // not part of this pipeline — it is not invoked for any text.language here.
      if (useMorphAnalysis) {
        log("INFO", "Запуск морфологического анализа");

        await this.dictionaryProcessor.analyzeVersion(version.id);
        const afterDict = await this.prisma.textToken.count({ where: { versionId: version.id, analyses: { none: {} } } });
        log("INFO", `После DictionaryProcessor: без анализа ${afterDict} токенов`);
        console.log(`[TOKENIZER] После DictionaryProcessor: без анализа ${afterDict} токенов`);
        await this._updateProgress(textId, version.id, 55);

        await this.dictionaryCacheProcessor.analyzeVersion(version.id);
        const afterCache = await this.prisma.textToken.count({ where: { versionId: version.id, analyses: { none: {} } } });
        log("INFO", `После DictionaryCacheProcessor: без анализа ${afterCache} токенов`);
        console.log(`[TOKENIZER] После DictionaryCacheProcessor: без анализа ${afterCache} токенов`);
        await this._updateProgress(textId, version.id, 70);

        await this.onlineDictionaryProcessor.analyzeVersion(version.id);
        const afterOnline = await this.prisma.textToken.count({ where: { versionId: version.id, analyses: { none: {} } } });
        log("INFO", `После OnlineDictionaryProcessor: без анализа ${afterOnline} токенов`);
        console.log(`[TOKENIZER] После OnlineDictionaryProcessor: без анализа ${afterOnline} токенов`);
        await this._updateProgress(textId, version.id, 80);

        await this.unknownWordProcessor.analyzeVersion(version.id);
        await this._updateProgress(textId, version.id, 90);

        log("OK", "Морфологический анализ завершён");
      } else {
        log("INFO", "Морфологический анализ пропущен (отключён настройкой)");
        await this._updateProgress(textId, version.id, 90);
      }

      // ── Apply admin MorphForm overrides ────────────────────────────────────
      const morphOverrideCount = await this.applyMorphFormOverrides(version.id);
      if (morphOverrideCount > 0) {
        log("OK", `Применено связок MorphForm (ADMIN): ${morphOverrideCount} токенов`);
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
      this.eventsService?.emit("status_change", { textId, status: "COMPLETED", progress: 100 });

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
      this.eventsService?.emit("status_change", { textId, status: "ERROR" });

      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  private async _updateProgress(textId: string, versionId: string, progress: number) {
    await Promise.all([
      this.prisma.textProcessingVersion.update({ where: { id: versionId }, data: { progress } }),
      this.prisma.text.update({ where: { id: textId }, data: { processingProgress: progress } }),
    ]);
    this.eventsService?.emit("progress", { textId, progress });
  }

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

  // Restore admin word links (MorphForm) for all tokens in this version.
  // When pages are deleted and re-tokenized, TokenAnalysis records are lost,
  // but MorphForm persists. This step re-applies those links so manually set
  // word associations survive tokenization.
  private async applyMorphFormOverrides(versionId: string): Promise<number> {
    const tokens = await this.prisma.textToken.findMany({
      where: { versionId },
      select: { id: true, normalized: true },
    });

    if (!tokens.length) return 0;

    const uniqueNormalized = [...new Set(tokens.map((t) => t.normalized))];

    const morphForms = await this.prisma.morphForm.findMany({
      where: { normalized: { in: uniqueNormalized } },
      select: { normalized: true, lemmaId: true },
    });

    if (!morphForms.length) return 0;

    const morphMap = new Map<string, string>();
    for (const mf of morphForms) {
      morphMap.set(mf.normalized, mf.lemmaId);
    }

    const tokensToOverride = tokens.filter((t) => morphMap.has(t.normalized));
    if (!tokensToOverride.length) return 0;

    const tokenIds = tokensToOverride.map((t) => t.id);

    await this.prisma.$transaction([
      this.prisma.tokenAnalysis.updateMany({
        where: { tokenId: { in: tokenIds }, isPrimary: true },
        data: { isPrimary: false },
      }),
      this.prisma.tokenAnalysis.createMany({
        data: tokensToOverride.map((t) => ({
          tokenId: t.id,
          lemmaId: morphMap.get(t.normalized)!,
          source: AnalysisSource.ADMIN,
          isPrimary: true,
          probability: 1.0,
        })),
        skipDuplicates: true,
      }),
    ]);

    // Promote any that were skipped by createMany (already existed with isPrimary=false)
    await this.prisma.tokenAnalysis.updateMany({
      where: {
        tokenId: { in: tokenIds },
        source: AnalysisSource.ADMIN,
        isPrimary: false,
        lemmaId: { in: [...new Set(morphForms.map((mf) => mf.lemmaId))] },
      },
      data: { isPrimary: true },
    });

    return tokensToOverride.length;
  }
}
