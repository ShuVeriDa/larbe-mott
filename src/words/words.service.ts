import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { UnknownWordProcessor } from "src/markup-engine/unknown-word/unknown-word.processor";
import { WordProgressService } from "src/progress/word-progress/word-progress.service";
import { TokenService } from "src/token/token.service";
import { WordLookupByWordService } from "./word-lookup-by-word.service";

@Injectable()
export class WordsService {
  private readonly logger = new Logger(WordsService.name);

  constructor(
    private readonly tokenService: TokenService,
    private readonly wordLookupByWordService: WordLookupByWordService,
    private readonly unknownWordProcessor: UnknownWordProcessor,
    private readonly wordProgress: WordProgressService,
    private readonly prisma: PrismaService,
  ) {}

  async lookup(tokenId: string, userId: string | undefined) {
    const info = await this.tokenService.getTokenInfo(tokenId, userId);
    const hasData =
      info.translation != null ||
      info.grammar != null ||
      info.baseForm != null;

    let translation: string | null;
    let grammar: string | null;
    let baseForm: string | null;
    let tags: string[];
    let wordLevel: string | null = null;
    let grammarForms: import("./word-lookup-by-word.service").WordLookupGrammar | null = null;
    let nounClass: string | null = null;
    let nounClassPlural: string | null = null;
    let variants: string[] = [];
    let sources: string[] = [];
    let attested = false;
    let setPhrases: { nah: string; ru: string }[] | null = null;
    let byWordMeanings: import("./word-lookup-by-word.service").WordLookupMeaning[] = [];
    let byWordLemmaId: string | null = null;

    if (hasData) {
      translation = info.translation ?? null;
      grammar = info.grammar ?? null;
      baseForm = info.baseForm ?? null;
      tags = info.tags ?? [];
    } else {
      const byWord = await this.wordLookupByWordService.lookup(info.word ?? info.normalized, userId, {
        tokenId: info.tokenId,
        textId: info.textId,
      });
      byWordLemmaId = byWord.lemmaId ?? null;
      translation = byWord.translation ?? null;
      grammar = byWord.grammar ?? null;
      grammarForms = byWord.grammarForms ?? null;
      nounClass = byWord.nounClass ?? null;
      nounClassPlural = byWord.nounClassPlural ?? null;
      baseForm = byWord.baseForm ?? null;
      tags = byWord.tags.length > 0 ? byWord.tags : (grammar ? [grammar] : []);
      wordLevel = byWord.wordLevel ?? null;
      variants = byWord.variants ?? [];
      sources = byWord.sources ?? [];
      attested = byWord.attested ?? false;
      setPhrases = byWord.setPhrases ?? null;
      byWordMeanings = byWord.meanings ?? [];

      const notFound = translation == null && grammar == null && baseForm == null;
      if (notFound) {
        void this.unknownWordProcessor
          .recordFromLookup(info.normalized, info.tokenId, info.textId)
          .catch(() => {});
      }
    }

    // Use lemmaId from TokenAnalysis first, fall back to lemmaId resolved by word lookup.
    // lemmaId from info (TokenAnalysis) may point to an admin-dict lemma with headwords;
    // byWordLemmaId is always from the online dict and never has headwords — skip the query.
    const lemmaId = info.lemmaId ?? byWordLemmaId;
    const forms: string[] = info.forms ?? [];

    // meanings: only query headwords for admin-dict lemmas (info.lemmaId present).
    // Online-lookup lemmas (byWordLemmaId) have no headwords — use byWordMeanings directly.
    let meanings: import("./word-lookup-by-word.service").WordLookupMeaning[] = [];
    if (info.lemmaId) {
      const headwords = await this.prisma.headword.findMany({
        where: { lemmaId: info.lemmaId },
        select: {
          entry: {
            select: {
              senses: {
                orderBy: { order: "asc" },
                select: {
                  definition: true,
                  examples: { select: { text: true, translation: true }, take: 5 },
                },
              },
            },
          },
        },
      });
      const allSenses = headwords.flatMap((h) => h.entry.senses);
      meanings = allSenses
        .filter((s) => s.definition)
        .map((s) => ({
          translation: s.definition!,
          note: null,
          examples: s.examples.map((e) => ({ text: e.text, translation: e.translation ?? null })),
        }));
    }
    if (meanings.length === 0) {
      meanings = byWordMeanings;
    }

    // Register click (awaited so userStatus/inDictionary below reflect the updated state)
    if (userId) {
      const hint = {
        word: info.word ?? info.normalized,
        normalized: info.normalized,
        translation: translation ?? "",
      };
      if (lemmaId) {
        await this.wordProgress.registerClick(userId, lemmaId, hint);
      } else if (hint.translation) {
        void this.wordProgress.ensureDictionaryEntry(userId, hint).catch((e) => {
          this.logger.warn(`ensureDictionaryEntry(no-lemma) failed: ${e instanceof Error ? e.message : String(e)}`);
        });
      }
    }

    // userStatus from UserWordProgress + inDictionary from UserDictionaryEntry
    let userStatus: string | null = null;
    let inDictionary = false;
    let dictionaryEntryId: string | null = null;
    let dictionaryFolder: { id: string; name: string } | null = null;
    if (userId && lemmaId) {
      const [progress, dictEntry] = await Promise.all([
        this.prisma.userWordProgress.findUnique({
          where: { userId_lemmaId: { userId, lemmaId } },
          select: { status: true },
        }),
        this.prisma.userDictionaryEntry.findFirst({
          where: { userId, lemmaId },
          select: {
            id: true,
            folder: { select: { id: true, name: true } },
          },
        }),
      ]);
      userStatus = progress?.status ?? null;
      inDictionary = dictEntry !== null;
      dictionaryEntryId = dictEntry?.id ?? null;
      dictionaryFolder = dictEntry?.folder ?? null;
    }

    return {
      lemmaId,
      translation,
      grammar,
      grammarForms,
      nounClass,
      nounClassPlural,
      baseForm,
      forms,
      tags,
      wordLevel,
      variants,
      sources,
      attested,
      setPhrases,
      meanings,
      userStatus,
      inDictionary,
      dictionaryEntryId,
      dictionaryFolder,
    };
  }

  // Связанные слова: синонимы / антонимы / однокоренные. Симметрично:
  // ищем по обеим сторонам WordRelation (lemmaId или relatedLemmaId совпадают),
  // дедуплицируем по (relatedLemmaId, type).
  async getRelated(lemmaId: string) {
    const [outgoing, incoming] = await Promise.all([
      this.prisma.wordRelation.findMany({
        where: { lemmaId },
        select: {
          type: true,
          related: {
            select: {
              id: true,
              baseForm: true,
              transliteration: true,
              level: true,
              partOfSpeech: true,
            },
          },
        },
      }),
      this.prisma.wordRelation.findMany({
        where: { relatedLemmaId: lemmaId },
        select: {
          type: true,
          lemma: {
            select: {
              id: true,
              baseForm: true,
              transliteration: true,
              level: true,
              partOfSpeech: true,
            },
          },
        },
      }),
    ]);

    const seen = new Set<string>();
    type RelatedOut = {
      type: string;
      lemmaId: string;
      baseForm: string;
      transliteration: string | null;
      level: string | null;
      partOfSpeech: string | null;
    };
    const items: RelatedOut[] = [];
    const push = (type: string, lemma: {
      id: string;
      baseForm: string;
      transliteration: string | null;
      level: string | null;
      partOfSpeech: string | null;
    }) => {
      const key = `${lemma.id}:${type}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({
        type,
        lemmaId: lemma.id,
        baseForm: lemma.baseForm,
        transliteration: lemma.transliteration,
        level: lemma.level,
        partOfSpeech: lemma.partOfSpeech,
      });
    };

    for (const r of outgoing) push(r.type, r.related);
    for (const r of incoming) push(r.type, r.lemma);

    // Подтянем перевод (rawTranslate) из DictionaryEntry через Headword,
    // чтобы фронт мог показать чип как «слово — перевод».
    const ids = items.map((i) => i.lemmaId);
    const translations = ids.length
      ? await this.prisma.headword.findMany({
          where: { lemmaId: { in: ids }, isPrimary: true },
          select: {
            lemmaId: true,
            entry: { select: { rawTranslate: true } },
          },
        })
      : [];
    const trMap = new Map<string, string>();
    for (const hw of translations) {
      if (hw.lemmaId && hw.entry.rawTranslate && !trMap.has(hw.lemmaId)) {
        trMap.set(hw.lemmaId, hw.entry.rawTranslate);
      }
    }
    return items.map((i) => ({
      ...i,
      translation: trMap.get(i.lemmaId) ?? null,
    }));
  }
}
