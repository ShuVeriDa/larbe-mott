import { Injectable } from "@nestjs/common";
import axios from "axios";
import { Language } from "@prisma/client";
import { DikResponse, LookupResult } from "./online-dictionary.type";

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

      // 1️⃣ прямой перевод
      if (data.data?.length) {
        const words = data.data[0]?.words;

        if (words?.length) {
          return {
            normalized: word,
            translation: words[0].translate ?? null,
          };
        }
      }

      // 2️⃣ suggestedWords fallback
      if (data.suggestedWords?.length) {
        const suggestion = data.suggestedWords[0];

        return {
          normalized: word,
          translation: suggestion.translate ?? null,
        };
      }

      return null;
    } catch {
      return null;
    }
  }
}
