import { Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { Language } from "@prisma/client";
import { DikResponse, LookupResult } from "./online-dictionary.type";
import { parseTranslation } from "./translation-parser";

/** Конфигурация внешних словарей по языку */
const ONLINE_DICT_CONFIG: Partial<Record<Language, { url: string; lang: string }>> = {
  [Language.CHE]: {
    url: "https://dikdosham.ru/backend/get_translate.php",
    lang: "che",
  },
  // Для AR и EN внешние словари пока не настроены — добавить при необходимости
};

@Injectable()
export class OnlineDictionaryService {
  private readonly logger = new Logger(OnlineDictionaryService.name);

  // 🔥 in-memory cache: ключ = "${language}:${normalized}"
  private readonly cache = new Map<string, Promise<LookupResult>>();

  async lookupWord(word: string, language: Language): Promise<LookupResult> {
    const config = ONLINE_DICT_CONFIG[language];
    if (!config) return null;

    const normalized = word.toLowerCase();
    const cacheKey = `${language}:${normalized}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const request = this.fetchWord(normalized, config);
    this.cache.set(cacheKey, request);
    return request;
  }

  private async fetchWord(
    word: string,
    config: { url: string; lang: string },
  ): Promise<LookupResult> {
    try {
      const response = await axios.post<DikResponse>(
        config.url,
        new URLSearchParams({
          word,
          lang: config.lang,
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          timeout: 5000,
        },
      );

      const data = response.data;

      if (!data) return null;

      // 1️⃣ прямой перевод — берём первый словарь с совпадением по слову
      if (data.data?.length) {
        const rawTranslate = this.pickBestTranslate(data.data, word);
        if (rawTranslate != null) {
          const parsed = parseTranslation(rawTranslate);
          return {
            normalized: word,
            translation: parsed?.main ?? null,
            tranAlt: parsed?.alt ?? null,
          };
        }
      }

      // 2️⃣ suggestedWords fallback
      if (data.suggestedWords?.length) {
        const parsed = parseTranslation(data.suggestedWords[0].translate);
        return {
          normalized: word,
          translation: parsed?.main ?? null,
          tranAlt: parsed?.alt ?? null,
        };
      }

      return null;
    } catch (error) {
      this.logger.warn(
        `Online dictionary lookup failed for "${word}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /**
   * Picks the best translate string from all dictionaries.
   * Priority: exact word1/word match (case-insensitive, accent-stripped) → first available.
   */
  private pickBestTranslate(
    dicts: DikResponse["data"],
    query: string,
  ): string | null {
    const q = this.stripAccents(query.toLowerCase());
    for (const dict of dicts) {
      for (const w of dict.words ?? []) {
        const key = this.stripAccents((w.word1 ?? w.word ?? "").toLowerCase());
        if (key === q && w.translate) return w.translate;
      }
    }
    // fallback: first non-empty translate
    for (const dict of dicts) {
      const first = dict.words?.find((w) => w.translate);
      if (first) return first.translate;
    }
    return null;
  }

  /** Remove combining diacritical marks and accent chars used in Chechen dictionaries. */
  private stripAccents(s: string): string {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
}
