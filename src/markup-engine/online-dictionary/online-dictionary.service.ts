import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Language } from "@prisma/client";
import axios from "axios";
import {
  DoshamEntry,
  LookupMeaning,
  LookupResult,
} from "./online-dictionary.type";
import { stripHtml } from "./translation-parser";

/** Языки, для которых наш dosham-словарь применим. */
const DOSHAM_LANGUAGES: ReadonlySet<Language> = new Set([Language.CHE]);

@Injectable()
export class OnlineDictionaryService {
  private readonly logger = new Logger(OnlineDictionaryService.name);
  private readonly baseUrl: string;

  // in-memory cache: ключ = "${language}:${normalized}"
  private readonly cache = new Map<string, Promise<LookupResult>>();

  constructor(configService: ConfigService) {
    this.baseUrl = configService
      .getOrThrow<string>("DOSHAM_API_URL")
      .replace(/\/+$/, "");
  }

  async lookupWord(word: string, language: Language): Promise<LookupResult> {
    if (!DOSHAM_LANGUAGES.has(language)) return null;

    const normalized = word.toLowerCase();
    const cacheKey = `${language}:${normalized}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const request = this.fetchWord(normalized);
    this.cache.set(cacheKey, request);
    return request;
  }

  private async fetchWord(word: string): Promise<LookupResult> {
    try {
      const url = `${this.baseUrl}/dictionary/lookup/${encodeURIComponent(word)}?strict=true`;
      const response = await axios.get<DoshamEntry[]>(url, { timeout: 5000 });
      const entries = response.data;
      console.log({ entries });

      if (!Array.isArray(entries) || entries.length === 0) return null;

      // Приоритизируем записи с точным совпадением word === word (не wordNormalized),
      // чтобы "ка" не возвращало данные от "къа" (у которого wordNormalized тоже "ка").
      const exactEntries = entries.filter((e) => e.word === word);
      const orderedEntries = exactEntries.length > 0
        ? [...exactEntries, ...entries.filter((e) => e.word !== word)]
        : entries;

      const entry = orderedEntries[0];
      const meaningEntries = exactEntries.length > 0 ? exactEntries : [entry];
      const allMeanings = meaningEntries.flatMap((e) => e.meanings ?? []);
      if (allMeanings.length === 0) return null;

      // Все значения с переводом и примерами
      const meanings: LookupMeaning[] = allMeanings
        .map((m) => ({
          translation: stripHtml(m.translation),
          note: m.note ? stripHtml(m.note) : null,
          examples: (m.examples ?? []).map((ex) => ({
            text: ex.nah,
            translation: ex.ru ?? null,
          })),
        }))
        .filter((m) => m.translation.length > 0);

      if (meanings.length === 0) return null;

      const baseForm = entry.wordAccented ?? entry.word ?? null;
      const grammar = entry.partOfSpeech ?? null;

      const tags: string[] = [];
      if (entry.partOfSpeech) tags.push(entry.partOfSpeech);
      if (entry.nounClass) tags.push(entry.nounClass);

      return {
        normalized: word,
        translation: meanings[0].translation,
        baseForm,
        grammar,
        grammarForms: entry.grammar ?? null,
        nounClass: entry.nounClass ?? null,
        nounClassPlural: entry.nounClassPlural ?? null,
        tags,
        wordLevel: entry.wordLevel ?? null,
        variants: entry.variants ?? [],
        sources: entry.sources ?? [],
        attested: entry.attested ?? false,
        setPhrases: entry.setPhrases ?? null,
        meanings,
      };
    } catch (error) {
      this.logger.warn(
        `Dosham dictionary lookup failed for "${word}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}
