import { Injectable } from "@nestjs/common";
import { AnalysisSource, Prisma, ProcessingTrigger } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { TokenizerService } from "src/markup-engine/tokenizer/tokenizer.service";
import { normalizeToken } from "src/markup-engine/tokenizer/tokenizer.utils";
import { DictionaryService } from "src/markup-engine/dictionary/dictionary.service";
import { extractTextFromTiptap } from "src/common/utils/extractTextFromTiptap";

// Virtual page size in characters of contentRaw (~same as admin PAGE_CHAR_LIMIT)
const PAGE_CHAR_LIMIT = 1800;

export interface ProcessUserTextOpts {
  trigger?: ProcessingTrigger;
  useNormalization?: boolean;
  useMorphAnalysis?: boolean;
}

export interface UserTextPage {
  pageIndex: number; // 0-based
  contentRaw: string;
}

/**
 * Mirrors TokenizerProcessor but writes to UserText* tables instead of Text* tables.
 * UserText stays private — no Text record is created in the main library.
 * Reuses TokenizerService (string-only, zero DB deps) and DictionaryService for lemma lookup.
 */
@Injectable()
export class UserTextTokenizerProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenizerService: TokenizerService,
    private readonly dictionaryService: DictionaryService,
  ) {}

  /**
   * Split content into pages.
   * Supports both the multi-page storage format ({ type:"doc", content:[{type:"multi_page_wrapper",attrs:{type:"multi-page",pages:[]}}] })
   * and legacy flat TipTap docs (split by char limit).
   */
  splitIntoPages(content: unknown): UserTextPage[] {
    // Detect multi-page format written by the frontend editor
    if (content && typeof content === "object") {
      const doc = content as { content?: unknown[] };
      if (Array.isArray(doc.content) && doc.content.length === 1) {
        const first = doc.content[0] as { type?: string; attrs?: { type?: string; pages?: unknown[] } };
        if (first?.type === "multi_page_wrapper" && first?.attrs?.type === "multi-page" && Array.isArray(first.attrs.pages)) {
          return first.attrs.pages.map((pageDoc, idx) => ({
            pageIndex: idx,
            contentRaw: extractTextFromTiptap(pageDoc),
          }));
        }
      }
    }

    // Legacy: split flat TipTap doc by char limit
    const fullText = extractTextFromTiptap(content);
    if (!fullText) return [{ pageIndex: 0, contentRaw: "" }];

    const pages: UserTextPage[] = [];
    let pageIndex = 0;
    let offset = 0;

    while (offset < fullText.length) {
      let end = offset + PAGE_CHAR_LIMIT;

      if (end >= fullText.length) {
        pages.push({ pageIndex, contentRaw: fullText.slice(offset).trim() });
        break;
      }

      while (end > offset && !/\s/.test(fullText[end])) { end--; }
      if (end === offset) end = offset + PAGE_CHAR_LIMIT;

      pages.push({ pageIndex, contentRaw: fullText.slice(offset, end).trim() });
      pageIndex++;
      offset = end + 1;
    }

    return pages.length ? pages : [{ pageIndex: 0, contentRaw: "" }];
  }

  /**
   * Main entry point. Creates UserTextProcessingVersion + tokens + vocabulary.
   * Lazy trigger: called when user first tries to read the text.
   * Subsequent calls are no-ops if isCurrent version already exists.
   */
  async processUserText(
    userTextId: string,
    userId: string,
    opts: ProcessUserTextOpts = {},
  ): Promise<void> {
    const {
      trigger = ProcessingTrigger.MANUAL,
      useNormalization = true,
      useMorphAnalysis = false, // off by default — can be enabled later
    } = opts;

    // Idempotency: if a current version already exists, skip
    const existing = await this.prisma.userTextProcessingVersion.findFirst({
      where: { userTextId, isCurrent: true, status: "COMPLETED" },
    });
    if (existing) return;

    const userText = await this.prisma.userText.findUnique({ where: { id: userTextId } });
    if (!userText || userText.userId !== userId) return;

    const latestVersion = await this.prisma.userTextProcessingVersion.findFirst({
      where: { userTextId },
      orderBy: { version: "desc" },
    });
    const versionNumber = (latestVersion?.version ?? 0) + 1;

    const version = await this.prisma.userTextProcessingVersion.create({
      data: {
        userTextId,
        userId,
        version: versionNumber,
        trigger,
        useNormalization,
        useMorphAnalysis,
        status: "RUNNING",
        progress: 0,
      },
    });

    try {
      const pages = this.splitIntoPages(userText.content);

      // ── Tokenization ─────────────────────────────────────────────────────
      let position = 0;
      const tokensToInsert: Prisma.UserTextTokenCreateManyInput[] = [];

      for (const page of pages) {
        const tokens = this.tokenizerService.tokenizeWithOffsets(page.contentRaw);
        for (const token of tokens) {
          tokensToInsert.push({
            versionId: version.id,
            pageIndex: page.pageIndex,
            position: position++,
            original: token.value,
            normalized: normalizeToken(token.value),
            startOffset: token.startOffset,
            endOffset: token.endOffset,
          });
        }
      }

      if (tokensToInsert.length) {
        await this.prisma.userTextToken.createMany({ data: tokensToInsert });
      }

      await this.prisma.userTextProcessingVersion.update({
        where: { id: version.id },
        data: { progress: 30 },
      });

      // ── Dictionary analysis (lemma lookup) ────────────────────────────────
      if (useMorphAnalysis) {
        await this.analyzeLemmas(version.id);
      }

      await this.prisma.userTextProcessingVersion.update({
        where: { id: version.id },
        data: { progress: 70 },
      });

      // ── Vocabulary index ──────────────────────────────────────────────────
      await this.buildVocabularyIndex(version.id);

      // ── Finalize ──────────────────────────────────────────────────────────
      await this.prisma.$transaction([
        this.prisma.userTextProcessingVersion.updateMany({
          where: { userTextId, id: { not: version.id } },
          data: { isCurrent: false },
        }),
        this.prisma.userTextProcessingVersion.update({
          where: { id: version.id },
          data: { status: "COMPLETED", progress: 100, isCurrent: true },
        }),
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.userTextProcessingVersion.update({
        where: { id: version.id },
        data: { status: "ERROR", errorMessage: message },
      });
      throw err;
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async analyzeLemmas(versionId: string): Promise<void> {
    const tokens = await this.prisma.userTextToken.findMany({
      where: { versionId },
      select: { id: true, normalized: true },
    });

    const words = [...new Set(tokens.map((t) => t.normalized).filter(Boolean))];
    if (!words.length) return;

    const lemmaMap = await this.dictionaryService.findWords(words);

    const analyses: Prisma.UserTextTokenAnalysisCreateManyInput[] = [];
    for (const token of tokens) {
      const entry = lemmaMap.get(token.normalized);
      if (!entry?.lemmaId) continue;
      analyses.push({
        tokenId: token.id,
        lemmaId: entry.lemmaId,
        source: AnalysisSource.ADMIN,
        isPrimary: true,
      });
    }

    if (analyses.length) {
      await this.prisma.userTextTokenAnalysis.createMany({ data: analyses });
    }
  }

  private async buildVocabularyIndex(versionId: string): Promise<void> {
    const uniqueWords = await this.prisma.userTextToken.findMany({
      where: { versionId },
      select: { normalized: true },
      distinct: ["normalized"],
    });

    const words = uniqueWords.map((w) => w.normalized).filter(Boolean);
    if (!words.length) return;

    await this.prisma.userTextVocabulary.createMany({
      data: words.map((word) => ({ versionId, normalized: word })),
      skipDuplicates: true,
    });

    // Link tokens to vocab entries
    await this.prisma.$executeRaw`
      UPDATE user_text_token t
      SET "vocabId" = v.id
      FROM user_text_vocabulary v
      WHERE t."versionId" = ${versionId}
        AND v."versionId" = ${versionId}
        AND t.normalized = v.normalized
    `;

    // Fill lemmaId + translation from analyses
    const tokens = await this.prisma.userTextToken.findMany({
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
                headwords: { orderBy: { order: "asc" }, take: 1, select: { text: true } },
              },
            },
          },
        },
      },
    });

    const vocabData = new Map<string, { lemmaId: string | null; translation: string | null }>();
    for (const t of tokens) {
      const vocabId = t.vocabId!;
      if (vocabData.has(vocabId)) continue;
      const primary = t.analyses[0];
      vocabData.set(vocabId, {
        lemmaId: primary?.lemmaId ?? null,
        translation: primary?.lemma?.headwords?.[0]?.text ?? null,
      });
    }

    for (const [vocabId, data] of vocabData) {
      await this.prisma.userTextVocabulary.update({
        where: { id: vocabId },
        data: { lemmaId: data.lemmaId, translation: data.translation },
      });
    }
  }
}
