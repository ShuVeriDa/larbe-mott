import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { Language } from "@prisma/client";
import { DoshamEntry, LookupResult } from "./online-dictionary.type";
import { parseTranslation } from "./translation-parser";

/** Языки, для которых наш dosham-словарь применим. */
const DOSHAM_LANGUAGES: ReadonlySet<Language> = new Set([Language.CHE]);

@Injectable()
export class OnlineDictionaryService {
  private readonly logger = new Logger(OnlineDictionaryService.name);
  private readonly baseUrl: string;

  // 🔥 in-memory cache: ключ = "${language}:${normalized}"
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
      const url = `${this.baseUrl}/dictionary/lookup/${encodeURIComponent(word)}`;
      const response = await axios.get<DoshamEntry[]>(url, { timeout: 5000 });
      const entries = response.data;

      if (!Array.isArray(entries) || entries.length === 0) return null;

      const meanings = entries.flatMap((e) => e.meanings ?? []);
      if (meanings.length === 0) return null;

      const main = parseTranslation(meanings[0]?.translation)?.main ?? null;
      const altCandidate =
        meanings[1]?.translation ??
        parseTranslation(meanings[0]?.translation)?.alt ??
        null;
      const alt = altCandidate
        ? (parseTranslation(altCandidate)?.main ?? altCandidate)
        : null;

      if (!main && !alt) return null;

      return {
        normalized: word,
        translation: main,
        tranAlt: alt,
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
