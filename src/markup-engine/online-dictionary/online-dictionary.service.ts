import { Injectable } from "@nestjs/common";
import axios from "axios";
import { DikResponse, LookupResult } from "./online-dictionary.type";

@Injectable()
export class OnlineDictionaryService {
  private readonly url = "https://dikdosham.ru/backend/get_translate.php";

  // 🔥 in-memory cache
  private readonly cache = new Map<string, Promise<LookupResult>>();

  async lookupWord(word: string): Promise<LookupResult> {
    const normalized = word.toLowerCase();

    // если уже запрашивали — вернуть из кеша
    if (this.cache.has(normalized)) {
      return this.cache.get(normalized)!;
    }

    const request = this.fetchWord(normalized);

    this.cache.set(normalized, request);

    return request;
  }

  private async fetchWord(word: string): Promise<LookupResult> {
    try {
      const response = await axios.post<DikResponse>(
        this.url,
        new URLSearchParams({
          word,
          lang: "ce",
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
