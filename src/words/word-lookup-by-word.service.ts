import { Injectable } from "@nestjs/common";
import { normalizeToken } from "src/markup-engine/tokenizer/tokenizer.utils";
import { AdminDictionaryService } from "src/markup-engine/dictionary/admin-dictionary.service";
import { DictionaryCacheService } from "src/markup-engine/dictionary-cache/dictionary-cache.service";
import { MorphologyService } from "src/markup-engine/morphology/morphology.service";
import { OnlineDictionaryService } from "src/markup-engine/online-dictionary/online-dictionary.service";
import { PrismaService } from "src/prisma.service";

export type WordLookupResult = {
  translation: string | null;
  grammar: string | null;
  baseForm: string | null;
};

/**
 * Цепочка поиска по строке слова в момент запроса (ЭТАП 15, сценарий B).
 * Порядок: админский словарь → кэш → онлайн → морфология.
 */
@Injectable()
export class WordLookupByWordService {
  constructor(
    private prisma: PrismaService,
    private adminDictionary: AdminDictionaryService,
    private dictionaryCache: DictionaryCacheService,
    private onlineDictionary: OnlineDictionaryService,
    private morphology: MorphologyService,
  ) {}

  async lookup(normalizedOrRaw: string): Promise<WordLookupResult> {
    const normalized = normalizeToken(normalizedOrRaw);

    // 1️⃣ Админский словарь
    const fromAdmin = await this.fromAdmin(normalized);
    if (fromAdmin) return fromAdmin;

    // 2️⃣ Кэш (DictionaryCache)
    const fromCache = await this.fromCache(normalized);
    if (fromCache) return fromCache;

    // 3️⃣ Онлайн словарь
    const fromOnline = await this.fromOnline(normalized);
    if (fromOnline) return fromOnline;

    // 4️⃣ Морфология
    const fromMorphology = await this.fromMorphology(normalized);
    if (fromMorphology) return fromMorphology;

    return { translation: null, grammar: null, baseForm: null };
  }

  private async fromAdmin(normalized: string): Promise<WordLookupResult | null> {
    const map = await this.adminDictionary.findWords([normalized]);
    const item = map.get(normalized);
    if (!item?.lemmaId) return null;
    return this.lemmaToResult(item.lemmaId);
  }

  private async fromCache(normalized: string): Promise<WordLookupResult | null> {
    const map = await this.dictionaryCache.findMap([normalized]);
    const row = map.get(normalized);
    if (!row) return null;
    const translation = row.translation ?? null;
    if (row.lemmaId) {
      const lemma = await this.prisma.lemma.findUnique({
        where: { id: row.lemmaId },
        select: { baseForm: true, partOfSpeech: true },
      });
      return {
        translation,
        grammar: lemma?.partOfSpeech ?? null,
        baseForm: lemma?.baseForm ?? null,
      };
    }
    return { translation, grammar: null, baseForm: null };
  }

  private async fromOnline(normalized: string): Promise<WordLookupResult | null> {
    const result = await this.onlineDictionary.lookupWord(normalized);
    if (!result?.translation) return null;
    return {
      translation: result.translation,
      grammar: null,
      baseForm: null,
    };
  }

  private async fromMorphology(normalized: string): Promise<WordLookupResult | null> {
    const analyzed = await this.morphology.analyze(normalized);
    if (!analyzed) return null;
    const lemma = "lemma" in analyzed ? (analyzed as { lemma: { id: string } }).lemma : (analyzed as { id: string });
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
          include: { entry: { select: { rawTranslate: true } } },
        },
      },
    });
    if (!lemma) return { translation: null, grammar: null, baseForm: null };
    const translation =
      lemma.headwords[0]?.entry?.rawTranslate ?? null;
    return {
      translation,
      grammar: lemma.partOfSpeech ?? null,
      baseForm: lemma.baseForm ?? null,
    };
  }
}
