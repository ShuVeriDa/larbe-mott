import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AiCacheStatus, AiCacheType } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { BatchTranslateDto } from "./dto/batch-translate.dto";
import { RefinePhraseDto } from "./dto/refine-phrase.dto";
import { SaveRefinementDto } from "./dto/save-refinement.dto";
import { TranslatePhraseDto } from "./dto/translate-phrase.dto";
import { TranslateWordDto } from "./dto/translate-word.dto";
import { VoteType } from "./dto/vote-cache.dto";
import { decryptApiKey, encryptApiKey } from "./encryption.util";
import { geminiUrl } from "./gemini.util";

const AUTO_APPROVE_MIN_REQUESTS = 10;
const AUTO_APPROVE_MIN_THUMBS_UP = 3;

@Injectable()
export class AiTranslationService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Gemini Key Management ───────────────────────────────────────────────────

  async saveGeminiKey(
    userId: string,
    apiKey: string | null | undefined,
  ): Promise<{ hasKey: boolean }> {
    if (!apiKey) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { geminiApiKeyEncrypted: null },
      });
      return { hasKey: false };
    }
    const encrypted = encryptApiKey(apiKey);
    await this.prisma.user.update({
      where: { id: userId },
      data: { geminiApiKeyEncrypted: encrypted },
    });
    return { hasKey: true };
  }

  async getKeyStatus(userId: string): Promise<{ hasKey: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { geminiApiKeyEncrypted: true },
    });
    return { hasKey: Boolean(user?.geminiApiKeyEncrypted) };
  }

  async verifyGeminiKey(
    userId: string,
  ): Promise<{ valid: boolean; error?: string }> {
    const apiKey = await this.getDecryptedKey(userId);
    if (!apiKey) {
      return { valid: false, error: "no_key" };
    }
    try {
      const result = await this.callGemini(apiKey, {
        contents: [{ parts: [{ text: "Ping. Reply with: OK" }] }],
      });
      return { valid: Boolean(result) };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { valid: false, error: msg };
    }
  }

  // ─── Word Translation ────────────────────────────────────────────────────────

  async translateWord(userId: string, dto: TranslateWordDto) {
    const normalized = dto.word.trim().toLowerCase();
    const cacheType = dto.contextSentence
      ? AiCacheType.WORD_IN_CONTEXT
      : AiCacheType.WORD_ONLY;

    // 1. Check AI cache
    const cached = await this.prisma.aiTranslationCache.findFirst({
      where: {
        lemma: normalized,
        cacheType,
        status: { in: [AiCacheStatus.PENDING, AiCacheStatus.APPROVED] },
      },
    });
    if (cached) {
      await this.prisma.aiTranslationCache.update({
        where: { id: cached.id },
        data: { requestCount: { increment: 1 } },
      });
      return { ...cached, fromCache: true };
    }

    // 2. Call Gemini
    const apiKey = await this.getDecryptedKey(userId);
    if (!apiKey) {
      throw new BadRequestException("Gemini API key not configured");
    }

    const prompt = this.buildWordPrompt(dto.word, dto.contextSentence);
    const raw = await this.callGemini(apiKey, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    });

    const parsed = this.parseWordResponse(raw);
    if (!parsed) {
      throw new BadRequestException("Could not parse Gemini response");
    }
    if (parsed.notChechen) {
      throw new BadRequestException("not_chechen");
    }

    // 3. Save to cache (upsert on lemma+cacheType)
    const entry = await this.prisma.aiTranslationCache.upsert({
      where: { lemma_cacheType: { lemma: normalized, cacheType } },
      create: {
        lemma: normalized,
        contextSentence: dto.contextSentence ?? null,
        cacheType,
        translation: parsed.translation,
        transliteration: parsed.transliteration ?? null,
        partOfSpeech: parsed.partOfSpeech ?? null,
        example: parsed.example ?? null,
        requestCount: 1,
      },
      update: {
        requestCount: { increment: 1 },
        updatedAt: new Date(),
      },
    });

    return { ...entry, fromCache: false };
  }

  // ─── Phrase Translation ──────────────────────────────────────────────────────

  async translatePhrase(userId: string, dto: TranslatePhraseDto) {
    const apiKey = await this.getDecryptedKey(userId);
    if (!apiKey) {
      throw new BadRequestException("Gemini API key not configured");
    }

    const prompt = this.buildPhrasePrompt(dto.phrase, dto.contextSentence);
    const raw = await this.callGemini(apiKey, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    });

    const parsed = this.parsePhraseResponse(raw);
    if (!parsed) {
      throw new BadRequestException("Could not parse Gemini response");
    }
    return parsed;
  }

  async refinePhrase(userId: string, dto: RefinePhraseDto) {
    const apiKey = await this.getDecryptedKey(userId);
    if (!apiKey) {
      throw new BadRequestException("Gemini API key not configured");
    }

    const prompt = this.buildRefinePrompt(
      dto.phrase,
      dto.previousTranslation,
      dto.hint,
    );
    const raw = await this.callGemini(apiKey, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    });

    const parsed = this.parsePhraseResponse(raw);
    if (!parsed) {
      throw new BadRequestException("Could not parse Gemini response");
    }
    return parsed;
  }

  // ─── Batch Translation ───────────────────────────────────────────────────────

  async batchTranslate(
    userId: string,
    dto: BatchTranslateDto,
  ): Promise<Record<string, string>> {
    const apiKey = await this.getDecryptedKey(userId);
    if (!apiKey) {
      throw new BadRequestException("Gemini API key not configured");
    }

    const deduped = [
      ...new Set(dto.words.map((w) => w.trim().toLowerCase())),
    ].slice(0, 50);

    const cachedEntries = await this.prisma.aiTranslationCache.findMany({
      where: {
        lemma: { in: deduped },
        cacheType: AiCacheType.WORD_ONLY,
        status: { in: [AiCacheStatus.PENDING, AiCacheStatus.APPROVED] },
      },
    });
    const cachedMap: Record<string, string> = {};
    for (const entry of cachedEntries) {
      cachedMap[entry.lemma] = entry.translation;
    }

    const uncached = deduped.filter((w) => !cachedMap[w]);
    const freshMap: Record<string, string> = {};

    if (uncached.length > 0) {
      const prompt = this.buildBatchPrompt(uncached);
      const raw = await this.callGemini(apiKey, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      });
      const parsed = this.parseBatchResponse(raw);
      if (parsed) {
        for (const [word, translation] of Object.entries(parsed)) {
          freshMap[word] = translation;
        }
        await Promise.allSettled(
          Object.entries(freshMap).map(([lemma, translation]) =>
            this.prisma.aiTranslationCache.upsert({
              where: {
                lemma_cacheType: { lemma, cacheType: AiCacheType.WORD_ONLY },
              },
              create: {
                lemma,
                cacheType: AiCacheType.WORD_ONLY,
                translation,
                requestCount: 1,
              },
              update: { requestCount: { increment: 1 }, updatedAt: new Date() },
            }),
          ),
        );
      }
    }

    const result: Record<string, string> = {};
    for (const word of deduped) {
      const translation = cachedMap[word] ?? freshMap[word];
      if (translation) result[word] = translation;
    }
    return result;
  }

  // ─── Save Refinement ─────────────────────────────────────────────────────────

  async saveRefinement(dto: SaveRefinementDto) {
    const normalized = dto.word.trim().toLowerCase();
    const cacheType = dto.contextSentence
      ? AiCacheType.WORD_IN_CONTEXT
      : AiCacheType.WORD_ONLY;

    const existing = await this.prisma.aiTranslationCache.findUnique({
      where: { lemma_cacheType: { lemma: normalized, cacheType } },
      select: { id: true, status: true },
    });

    if (existing?.status === AiCacheStatus.APPROVED) return;

    await this.prisma.aiTranslationCache.upsert({
      where: { lemma_cacheType: { lemma: normalized, cacheType } },
      create: {
        lemma: normalized,
        contextSentence: dto.contextSentence ?? null,
        cacheType,
        translation: dto.translation,
        requestCount: 1,
        status: AiCacheStatus.PENDING,
      },
      update: {
        translation: dto.translation,
        status: AiCacheStatus.PENDING,
        updatedAt: new Date(),
      },
    });
  }

  // ─── Voting ──────────────────────────────────────────────────────────────────

  async vote(cacheId: string, vote: VoteType) {
    const entry = await this.prisma.aiTranslationCache.findUnique({
      where: { id: cacheId },
    });
    if (!entry) throw new NotFoundException("Cache entry not found");

    const updated = await this.prisma.aiTranslationCache.update({
      where: { id: cacheId },
      data:
        vote === "up"
          ? { thumbsUp: { increment: 1 } }
          : { thumbsDown: { increment: 1 } },
    });

    await this.tryAutoApprove(updated);
    return updated;
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private async getDecryptedKey(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { geminiApiKeyEncrypted: true },
    });
    if (!user?.geminiApiKeyEncrypted) return null;
    try {
      return decryptApiKey(user.geminiApiKeyEncrypted);
    } catch {
      return null;
    }
  }

  private async tryAutoApprove(entry: {
    id: string;
    requestCount: number;
    thumbsUp: number;
    thumbsDown: number;
    status: AiCacheStatus;
  }) {
    if (
      entry.status === AiCacheStatus.PENDING &&
      entry.requestCount >= AUTO_APPROVE_MIN_REQUESTS &&
      entry.thumbsUp >= AUTO_APPROVE_MIN_THUMBS_UP &&
      entry.thumbsDown === 0
    ) {
      await this.prisma.aiTranslationCache.update({
        where: { id: entry.id },
        data: { status: AiCacheStatus.APPROVED },
      });
    }
  }

  private sanitize(input: string): string {
    return input.replace(/\\/g, "\\\\").replace(/"/g, '\\"').slice(0, 2000);
  }

  private buildWordPrompt(word: string, context?: string): string {
    const safeWord = this.sanitize(word);
    const contextLine = context
      ? `\nContext sentence: "${this.sanitize(context)}"`
      : "";
    return `You are a Chechen-Russian language assistant. Given the Chechen word below${context ? " and its context sentence" : ""}, return a JSON object with these fields:
- "notChechen": boolean (true if the word is NOT Chechen)
- "translation": string (Russian translation, considering context if provided)
- "transliteration": string (Latin transliteration of the Chechen word)
- "partOfSpeech": string (part of speech in Russian, e.g. "существительное", "глагол")
- "example": string (a short usage example in Chechen with Russian translation, format: "Chechen — Russian")

Word: "${safeWord}"${contextLine}

Return only valid JSON, no markdown.`;
  }

  private buildRefinePrompt(
    phrase: string,
    previousTranslation: string,
    hint: string,
  ): string {
    return `You are a Chechen-Russian language assistant. You previously translated a Chechen phrase, but the user says the translation is inaccurate and provides a clarifying hint.

Phrase: "${this.sanitize(phrase)}"
Previous translation: "${this.sanitize(previousTranslation)}"
User hint: "${this.sanitize(hint)}"

Based on the hint, provide a more accurate translation. Return a JSON object:
- "translation": string (corrected Russian translation)
- "notes": string (explanation of the correction or additional context, empty string if none)

Return only valid JSON, no markdown.`;
  }

  private buildBatchPrompt(words: string[]): string {
    const list = words
      .map((w, i) => `${i + 1}. "${this.sanitize(w)}"`)
      .join("\n");
    return `You are a Chechen-Russian language assistant. Translate each Chechen word into Russian. Return a JSON object where each key is the exact Chechen word and the value is its Russian translation (1-3 words). If a word is not Chechen, omit it from the result.

Words:
${list}

Return only valid JSON, no markdown. Example: {"дуьне": "мир", "стаг": "человек"}`;
  }

  private parseBatchResponse(raw: string): Record<string, string> | null {
    try {
      const clean = raw
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      const parsed = JSON.parse(clean);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      )
        return null;
      const result: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (
          typeof k === "string" &&
          typeof v === "string" &&
          k.length > 0 &&
          v.length > 0
        ) {
          result[k] = v;
        }
      }
      return Object.keys(result).length > 0 ? result : null;
    } catch {
      return null;
    }
  }

  private buildPhrasePrompt(phrase: string, contextSentence?: string): string {
    const contextLine = contextSentence
      ? `\nContext (surrounding sentence): "${this.sanitize(contextSentence)}"`
      : "";
    return `You are a Chechen-Russian language assistant. Translate the following Chechen phrase into Russian${contextSentence ? ", using the surrounding sentence for context" : ""}. Return a JSON object:
- "translation": string (Russian translation of the phrase)
- "notes": string (optional notes or comments, empty string if none)

Phrase: "${this.sanitize(phrase)}"${contextLine}

Return only valid JSON, no markdown.`;
  }

  private async callGemini(
    apiKey: string,
    body: Record<string, unknown>,
    retries = 3,
  ): Promise<string> {
    const url = geminiUrl(apiKey);
    for (let attempt = 0; attempt <= retries; attempt++) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      }
      const isRetryable = res.status === 503 || res.status === 429;
      if (!isRetryable || attempt === retries) {
        const err = await res.text();
        throw new Error(`Gemini API error ${res.status}: ${err}`);
      }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
    throw new Error("Gemini API: exhausted retries");
  }

  private parseWordResponse(raw: string): {
    notChechen?: boolean;
    translation: string;
    transliteration?: string;
    partOfSpeech?: string;
    example?: string;
  } | null {
    try {
      const clean = raw
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      return JSON.parse(clean);
    } catch {
      return null;
    }
  }

  private parsePhraseResponse(
    raw: string,
  ): { translation: string; notes?: string } | null {
    try {
      const clean = raw
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      return JSON.parse(clean);
    } catch {
      return null;
    }
  }
}
