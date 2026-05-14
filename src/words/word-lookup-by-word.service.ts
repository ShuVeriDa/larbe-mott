import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { Language, SubscriptionStatus, UserEventType } from "@prisma/client";
import { DictionaryCacheService } from "src/markup-engine/dictionary-cache/dictionary-cache.service";
import { DictionaryService } from "src/markup-engine/dictionary/dictionary.service";
import { MorphologyService } from "src/markup-engine/morphology/morphology.service";
import { OnlineDictionaryService } from "src/markup-engine/online-dictionary/online-dictionary.service";
import { normalizeToken } from "src/markup-engine/tokenizer/tokenizer.utils";
import { UnknownWordProcessor } from "src/markup-engine/unknown-word/unknown-word.processor";
import { PrismaService } from "src/prisma.service";

export interface WordLookupExample {
  text: string;
  translation: string | null;
}

export interface WordLookupMeaning {
  translation: string;
  note: string | null;
  examples: WordLookupExample[];
}

export interface WordLookupGrammar {
  genitive?: string | null;
  dative?: string | null;
  ergative?: string | null;
  instrumental?: string | null;
  plural?: string | null;
  pluralClass?: string | null;
  obliqueStem?: string | null;
  verbPresent?: string | null;
  verbPast?: string | null;
  verbParticiple?: string | null;
}

export type WordLookupResult = {
  translation: string | null;
  grammar: string | null;
  grammarForms: WordLookupGrammar | null;
  nounClass: string | null;
  nounClassPlural: string | null;
  baseForm: string | null;
  tags: string[];
  wordLevel: string | null;
  variants: string[];
  sources: string[];
  attested: boolean;
  setPhrases: { nah: string; ru: string }[] | null;
  meanings: WordLookupMeaning[];
};

type LookupContext = {
  tokenId?: string;
  textId?: string;
};

/**
 * Цепочка поиска по строке слова в момент запроса (ЭТАП 15, сценарий B).
 * Порядок: админский словарь → кэш → онлайн → морфология.
 */
@Injectable()
export class WordLookupByWordService {
  private readonly logger = new Logger(WordLookupByWordService.name);

  constructor(
    private prisma: PrismaService,
    private adminDictionary: DictionaryService,
    private dictionaryCache: DictionaryCacheService,
    private onlineDictionary: OnlineDictionaryService,
    private morphology: MorphologyService,
    private unknownWordProcessor: UnknownWordProcessor,
  ) {}

  async lookup(
    normalizedOrRaw: string,
    userId?: string,
    context?: LookupContext,
  ): Promise<WordLookupResult> {
    const normalized = normalizeToken(normalizedOrRaw);
    const language = await this.resolveUserLanguage(userId);
    await this.enforceTranslationLimit(userId);

    // 1️⃣ Админский словарь
    const fromAdmin = await this.fromAdmin(normalized, language);
    if (fromAdmin) {
      this.recordTranslationUsage(userId, normalized, context, "admin");
      return fromAdmin;
    }

    // 2️⃣ Кэш (DictionaryCache)
    const fromCache = await this.fromCache(normalized);
    if (fromCache) {
      this.recordTranslationUsage(userId, normalized, context, "cache");
      return fromCache;
    }

    // 3️⃣ Онлайн словарь
    const fromOnline = await this.fromOnline(normalized, language);
    if (fromOnline) {
      this.recordTranslationUsage(userId, normalized, context, "online");
      return fromOnline;
    }

    // 4️⃣ Морфология
    const fromMorphology = await this.fromMorphology(normalized, language);
    if (fromMorphology) {
      this.recordTranslationUsage(userId, normalized, context, "morphology");
      return fromMorphology;
    }

    // Не найдено — тихо записываем в неизвестные (без задержки ответа)
    void this.unknownWordProcessor.recordFromLookup(normalized).catch(() => {});

    if (userId) {
      this.runInBackground(
        this.prisma.userEvent.create({
          data: {
            userId,
            type: UserEventType.FAIL_LOOKUP,
            metadata: {
              normalized,
              ...(context?.tokenId ? { tokenId: context.tokenId } : {}),
              ...(context?.textId ? { textId: context.textId } : {}),
            },
          },
        }),
        "recordFailLookup",
      );
    }

    return {
      translation: null,
      grammar: null,
      grammarForms: null,
      nounClass: null,
      nounClassPlural: null,
      baseForm: null,
      tags: [],
      wordLevel: null,
      variants: [],
      sources: [],
      attested: false,
      setPhrases: null,
      meanings: [],
    };
  }

  private async resolveUserLanguage(userId?: string): Promise<Language> {
    if (!userId) return Language.CHE;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { language: true },
    });
    return user?.language ?? Language.CHE;
  }

  private async fromAdmin(
    normalized: string,
    language: Language,
  ): Promise<WordLookupResult | null> {
    const map = await this.adminDictionary.findWords([normalized], language);
    const item = map.get(normalized);
    if (!item?.lemmaId) return null;
    return this.lemmaToResult(item.lemmaId);
  }

  private async fromCache(
    normalized: string,
  ): Promise<WordLookupResult | null> {
    const map = await this.dictionaryCache.findMap([normalized]);
    const row = map.get(normalized);
    if (!row) return null;
    const translation = row.translation ?? null;
    const meanings = (row.meanings as WordLookupMeaning[] | null) ?? [];
    const cached = (row.examples as unknown[] | null);
    const base: Omit<WordLookupResult, 'grammar' | 'baseForm' | 'tags'> = {
      translation,
      grammarForms: null,
      nounClass: null,
      nounClassPlural: null,
      wordLevel: null,
      variants: [],
      sources: [],
      attested: false,
      setPhrases: null,
      meanings: meanings.length > 0 ? meanings : (cached as WordLookupMeaning[] ?? []),
    };
    if (row.lemmaId) {
      const lemma = await this.prisma.lemma.findUnique({
        where: { id: row.lemmaId },
        select: { baseForm: true, partOfSpeech: true },
      });
      return {
        ...base,
        grammar: lemma?.partOfSpeech ?? null,
        baseForm: lemma?.baseForm ?? null,
        tags: lemma?.partOfSpeech ? [lemma.partOfSpeech] : [],
      };
    }
    return { ...base, grammar: null, baseForm: null, tags: [] };
  }

  private async fromOnline(
    normalized: string,
    language: Language,
  ): Promise<WordLookupResult | null> {
    const result = await this.onlineDictionary.lookupWord(normalized, language);
    if (!result?.translation) return null;
    return {
      translation: result.translation,
      grammar: result.grammar ?? null,
      grammarForms: result.grammarForms ?? null,
      nounClass: result.nounClass ?? null,
      nounClassPlural: result.nounClassPlural ?? null,
      baseForm: result.baseForm ?? null,
      tags: result.tags ?? [],
      wordLevel: result.wordLevel ?? null,
      variants: result.variants ?? [],
      sources: result.sources ?? [],
      attested: result.attested ?? false,
      setPhrases: result.setPhrases ?? null,
      meanings: result.meanings ?? [],
    };
  }

  private async fromMorphology(
    normalized: string,
    language: Language,
  ): Promise<WordLookupResult | null> {
    const analyzed = await this.morphology.analyze(normalized, language);
    if (!analyzed) return null;
    const lemma =
      "lemma" in analyzed
        ? (analyzed as { lemma: { id: string } }).lemma
        : (analyzed as { id: string });
    const lemmaId = lemma?.id ?? null;
    if (lemmaId) return this.lemmaToResult(lemmaId);
    return null;
  }

  private async lemmaToResult(lemmaId: string): Promise<WordLookupResult> {
    const lemma = await this.prisma.lemma.findUnique({
      where: { id: lemmaId },
      include: {
        headwords: {
          take: 1,
          orderBy: { order: "asc" },
          include: {
            entry: {
              select: {
                rawTranslate: true,
                senses: {
                  orderBy: { order: "asc" },
                  select: {
                    definition: true,
                    examples: {
                      select: { text: true, translation: true },
                      take: 3,
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const emptyResult: WordLookupResult = {
      translation: null,
      grammar: null,
      grammarForms: null,
      nounClass: null,
      nounClassPlural: null,
      baseForm: null,
      tags: [],
      wordLevel: null,
      variants: [],
      sources: [],
      attested: false,
      setPhrases: null,
      meanings: [],
    };
    if (!lemma) return emptyResult;

    const rawTranslate = lemma.headwords[0]?.entry?.rawTranslate ?? null;
    const senses = lemma.headwords[0]?.entry?.senses ?? [];
    const pos = lemma.partOfSpeech ?? null;

    const meanings: WordLookupMeaning[] =
      senses.length > 0
        ? senses
            .filter((s) => s.definition)
            .map((s) => ({
              translation: s.definition!,
              note: null,
              examples: s.examples.map((e) => ({
                text: e.text,
                translation: e.translation ?? null,
              })),
            }))
        : rawTranslate
          ? [{ translation: rawTranslate, note: null, examples: [] }]
          : [];

    return {
      ...emptyResult,
      translation: meanings[0]?.translation ?? rawTranslate,
      grammar: pos,
      baseForm: lemma.baseForm ?? null,
      tags: pos ? [pos] : [],
      meanings,
    };
  }

  private async enforceTranslationLimit(userId?: string): Promise<void> {
    if (!userId) return;

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [translationsToday, subscription] = await Promise.all([
      this.prisma.userEvent.count({
        where: {
          userId,
          type: UserEventType.CLICK_WORD,
          createdAt: { gte: todayStart },
        },
      }),
      this.prisma.subscription.findFirst({
        where: {
          userId,
          status: {
            in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
          },
        },
        include: { plan: true },
        orderBy: { startDate: "desc" },
      }),
    ]);

    const planLimits = subscription?.plan?.limits as Record<
      string,
      number
    > | null;
    const translationsPerDay = planLimits?.translationsPerDay ?? 50;
    if (translationsPerDay !== -1 && translationsToday >= translationsPerDay) {
      throw new ForbiddenException(
        `Daily translation limit of ${translationsPerDay} reached. Upgrade your plan for more.`,
      );
    }
  }

  private recordTranslationUsage(
    userId: string | undefined,
    normalized: string,
    context: LookupContext | undefined,
    source: "admin" | "cache" | "online" | "morphology",
  ): void {
    if (!userId) return;
    this.runInBackground(
      this.prisma.userEvent.create({
        data: {
          userId,
          type: UserEventType.CLICK_WORD,
          metadata: {
            normalized,
            source: `lookup_by_word:${source}`,
            ...(context?.tokenId ? { tokenId: context.tokenId } : {}),
            ...(context?.textId ? { textId: context.textId } : {}),
          },
        },
      }),
      "recordLookupByWordUsage",
    );
  }

  private runInBackground(promise: Promise<unknown>, operation: string): void {
    void promise.catch((error) => {
      this.logger.warn(
        `${operation} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }
}
