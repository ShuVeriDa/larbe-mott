import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { UnknownWordProcessor } from "src/markup-engine/unknown-word/unknown-word.processor";
import { TokenService } from "src/token/token.service";
import { WordLookupByWordService } from "./word-lookup-by-word.service";

@Injectable()
export class WordsService {
  constructor(
    private readonly tokenService: TokenService,
    private readonly wordLookupByWordService: WordLookupByWordService,
    private readonly unknownWordProcessor: UnknownWordProcessor,
    private readonly prisma: PrismaService,
  ) {}

  async lookup(tokenId: string, userId: string | undefined) {
    const info = await this.tokenService.getTokenInfo(tokenId, userId);
    const hasData =
      info.translation != null ||
      info.grammar != null ||
      info.baseForm != null;

    let translation: string | null;
    let tranAlt: string | null;
    let grammar: string | null;
    let baseForm: string | null;
    let tags: string[];

    if (hasData) {
      translation = info.translation ?? null;
      tranAlt = info.tranAlt ?? null;
      grammar = info.grammar ?? null;
      baseForm = info.baseForm ?? null;
      tags = info.tags ?? [];
    } else {
      const byWord = await this.wordLookupByWordService.lookup(info.normalized, userId, {
        tokenId: info.tokenId,
        textId: info.textId,
      });
      translation = byWord.translation ?? null;
      tranAlt = byWord.tranAlt ?? null;
      grammar = byWord.grammar ?? null;
      baseForm = byWord.baseForm ?? null;
      tags = grammar ? [grammar] : [];

      const notFound = translation == null && grammar == null && baseForm == null;
      if (notFound) {
        void this.unknownWordProcessor
          .recordFromLookup(info.normalized, info.tokenId, info.textId)
          .catch(() => {});
      }
    }

    const lemmaId = info.lemmaId ?? null;
    const forms: string[] = info.forms ?? [];

    // examples from DictionaryEntry senses
    let examples: { text: string; translation: string | null }[] = [];
    if (lemmaId) {
      const headwords = await this.prisma.headword.findMany({
        where: { lemmaId },
        select: {
          entry: {
            select: {
              senses: {
                select: {
                  examples: { select: { text: true, translation: true }, take: 5 },
                },
                take: 3,
              },
            },
          },
        },
      });
      examples = headwords
        .flatMap((h) => h.entry.senses)
        .flatMap((s) => s.examples)
        .slice(0, 10);
    }

    // userStatus from UserWordProgress + inDictionary from UserDictionaryEntry
    let userStatus: string | null = null;
    let inDictionary = false;
    let dictionaryEntryId: string | null = null;
    if (userId && lemmaId) {
      const [progress, dictEntry] = await Promise.all([
        this.prisma.userWordProgress.findUnique({
          where: { userId_lemmaId: { userId, lemmaId } },
          select: { status: true },
        }),
        this.prisma.userDictionaryEntry.findFirst({
          where: { userId, lemmaId },
          select: { id: true },
        }),
      ]);
      userStatus = progress?.status ?? null;
      inDictionary = dictEntry !== null;
      dictionaryEntryId = dictEntry?.id ?? null;
    }

    return {
      lemmaId,
      translation,
      tranAlt,
      grammar,
      baseForm,
      forms,
      tags,
      examples,
      userStatus,
      inDictionary,
      dictionaryEntryId,
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
