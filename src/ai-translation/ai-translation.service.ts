import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { AiCacheStatus, AiCacheType } from "@prisma/client";
import { FeatureFlagsService } from "src/feature-flags/feature-flags.service";
import { PrismaService } from "src/prisma.service";
import { BatchTranslateDto } from "./dto/batch-translate.dto";
import { RefinePhraseDto } from "./dto/refine-phrase.dto";
import { SaveRefinementDto } from "./dto/save-refinement.dto";
import { TranslatePhraseDto } from "./dto/translate-phrase.dto";
import { TranslateWordDto } from "./dto/translate-word.dto";
import { SOURCE_LANGUAGE_NAMES, SourceLanguage, TranslationLanguage } from "./dto/translation-language";
import { VoteType } from "./dto/vote-cache.dto";
import { decryptApiKey, encryptApiKey } from "./encryption.util";
import { parseGeminiError, type FallbackReason } from "./gemini-error";
import { DEFAULT_GEMINI_MODEL, geminiUrl, SUPPORTED_GEMINI_MODELS, type GeminiModel } from "./gemini.util";
import { quarantine } from "./model-quarantine";
import { ErrorCode } from "src/common/errors/error-codes";

class GeminiRateLimitError extends Error {
  constructor(
    public readonly reason: FallbackReason,
    public readonly retryAfterMs: number,
  ) {
    super("gemini_rate_limit");
  }
}

const AUTO_APPROVE_MIN_REQUESTS = 10;
const AUTO_APPROVE_MIN_THUMBS_UP = 3;

const LANGUAGE_NAMES: Record<TranslationLanguage, string> = {
  ru: "Russian",
  en: "English",
  ar: "Arabic",
  de: "German",
  fr: "French",
  tr: "Turkish",
};

@Injectable()
export class AiTranslationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  private async assertSourceLanguageAccess(userId: string, sourceLanguage: SourceLanguage): Promise<void> {
    if (!(await this.featureFlags.canAccessContentLanguage(userId, sourceLanguage))) {
      throw new BadRequestException({
        code: ErrorCode.SOURCE_LANGUAGE_NOT_ACCESSIBLE,
        message: "source_language_not_accessible",
      });
    }
  }

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

  async getKeyStatus(userId: string): Promise<{ hasKey: boolean; model: GeminiModel }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { geminiApiKeyEncrypted: true, geminiModel: true },
    });
    const model = this.resolveModel(user?.geminiModel);
    return { hasKey: Boolean(user?.geminiApiKeyEncrypted), model };
  }

  async saveGeminiModel(
    userId: string,
    model: GeminiModel,
  ): Promise<{ model: GeminiModel }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { geminiModel: model },
    });
    return { model };
  }

  async verifyGeminiKey(
    userId: string,
  ): Promise<{ valid: boolean; error?: string }> {
    const keyAndModel = await this.getUserKeyAndModel(userId);
    if (!keyAndModel) {
      return { valid: false, error: "no_key" };
    }
    try {
      const result = await this.callGemini(
        keyAndModel.apiKey,
        { contents: [{ parts: [{ text: "Ping. Reply with: OK" }] }] },
        keyAndModel.model,
      );
      return { valid: Boolean(result) };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { valid: false, error: msg };
    }
  }

  // ─── Word Translation ────────────────────────────────────────────────────────

  async translateWord(userId: string, dto: TranslateWordDto) {
    const normalized = dto.word.trim().toLowerCase();
    const targetLanguage: TranslationLanguage = dto.targetLanguage ?? "ru";
    const sourceLanguage: SourceLanguage = dto.sourceLanguage ?? "che";
    await this.assertSourceLanguageAccess(userId, sourceLanguage);
    const cacheType = dto.contextSentence
      ? AiCacheType.WORD_IN_CONTEXT
      : AiCacheType.WORD_ONLY;

    // 1a. Check exact cache (lemma + cacheType + sourceLanguage + targetLanguage)
    const cached = await this.prisma.aiTranslationCache.findFirst({
      where: {
        lemma: normalized,
        cacheType,
        sourceLanguage,
        targetLanguage,
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

    // 1b. Fallback: if context was provided but no WORD_IN_CONTEXT hit,
    //     check WORD_ONLY — avoids a Gemini call when a base translation exists
    if (dto.contextSentence) {
      const cachedWordOnly = await this.prisma.aiTranslationCache.findFirst({
        where: {
          lemma: normalized,
          cacheType: AiCacheType.WORD_ONLY,
          sourceLanguage,
          targetLanguage,
          status: { in: [AiCacheStatus.PENDING, AiCacheStatus.APPROVED] },
        },
      });
      if (cachedWordOnly) {
        await this.prisma.aiTranslationCache.update({
          where: { id: cachedWordOnly.id },
          data: { requestCount: { increment: 1 } },
        });
        return { ...cachedWordOnly, fromCache: true };
      }
    }

    // 2. Call Gemini
    const keyAndModel = await this.getUserKeyAndModel(userId);
    if (!keyAndModel) {
      throw new BadRequestException({ code: ErrorCode.GEMINI_KEY_NOT_CONFIGURED, message: "Gemini API key not configured" });
    }

    const prompt = this.buildWordPrompt(dto.word, targetLanguage, sourceLanguage, dto.contextSentence);
    const { text: raw, fallbackUsed, fallbackReason, retryAfterSeconds } = await this.callGeminiSafe(
      userId,
      keyAndModel.apiKey,
      { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } },
      keyAndModel.model,
    );

    const parsed = this.parseWordResponse(raw);
    if (!parsed) {
      throw new BadRequestException({ code: ErrorCode.GEMINI_PARSE_ERROR, message: "Could not parse Gemini response" });
    }
    if (parsed.notChechen) {
      throw new BadRequestException({ code: ErrorCode.NOT_CHECHEN, message: "not_chechen" });
    }

    // 3. Save to cache (upsert on lemma + cacheType + sourceLanguage + targetLanguage)
    const entry = await this.prisma.aiTranslationCache.upsert({
      where: {
        lemma_cacheType_sourceLanguage_targetLanguage: {
          lemma: normalized,
          cacheType,
          sourceLanguage,
          targetLanguage,
        },
      },
      create: {
        lemma: normalized,
        contextSentence: dto.contextSentence ?? null,
        cacheType,
        sourceLanguage,
        targetLanguage,
        translation: parsed.translation,
        russianGloss: targetLanguage !== "ru" ? (parsed.russianGloss ?? null) : null,
        transliteration: parsed.transliteration ?? null,
        partOfSpeech: parsed.partOfSpeech ?? null,
        baseForm: parsed.baseForm ?? null,
        nounClass: parsed.nounClass ?? null,
        example: parsed.example ?? null,
        requestCount: 1,
      },
      update: {
        requestCount: { increment: 1 },
        updatedAt: new Date(),
      },
    });

    return { ...entry, fromCache: false, fallbackUsed, fallbackReason, retryAfterSeconds };
  }

  // ─── Phrase Translation ──────────────────────────────────────────────────────

  async translatePhrase(userId: string, dto: TranslatePhraseDto) {
    const keyAndModel = await this.getUserKeyAndModel(userId);
    if (!keyAndModel) {
      throw new BadRequestException({ code: ErrorCode.GEMINI_KEY_NOT_CONFIGURED, message: "Gemini API key not configured" });
    }

    const targetLanguage: TranslationLanguage = dto.targetLanguage ?? "ru";
    const sourceLanguage: SourceLanguage = dto.sourceLanguage ?? "che";
    await this.assertSourceLanguageAccess(userId, sourceLanguage);
    const prompt = this.buildPhrasePrompt(dto.phrase, targetLanguage, sourceLanguage, dto.contextSentence);
    const { text: raw, fallbackUsed, fallbackReason, retryAfterSeconds } = await this.callGeminiSafe(
      userId,
      keyAndModel.apiKey,
      { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } },
      keyAndModel.model,
    );

    const parsed = this.parsePhraseResponse(raw);
    if (!parsed) {
      throw new BadRequestException({ code: ErrorCode.GEMINI_PARSE_ERROR, message: "Could not parse Gemini response" });
    }
    return { ...parsed, fallbackUsed, fallbackReason, retryAfterSeconds };
  }

  async refinePhrase(userId: string, dto: RefinePhraseDto) {
    const keyAndModel = await this.getUserKeyAndModel(userId);
    if (!keyAndModel) {
      throw new BadRequestException({ code: ErrorCode.GEMINI_KEY_NOT_CONFIGURED, message: "Gemini API key not configured" });
    }

    const targetLanguage: TranslationLanguage = dto.targetLanguage ?? "ru";
    const sourceLanguage: SourceLanguage = dto.sourceLanguage ?? "che";
    await this.assertSourceLanguageAccess(userId, sourceLanguage);
    const prompt = this.buildRefinePrompt(
      dto.phrase,
      dto.previousTranslation,
      dto.hint,
      targetLanguage,
      sourceLanguage,
    );
    const { text: raw, fallbackUsed, fallbackReason, retryAfterSeconds } = await this.callGeminiSafe(
      userId,
      keyAndModel.apiKey,
      { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } },
      keyAndModel.model,
    );

    const parsed = this.parsePhraseResponse(raw);
    if (!parsed) {
      throw new BadRequestException({ code: ErrorCode.GEMINI_PARSE_ERROR, message: "Could not parse Gemini response" });
    }
    return { ...parsed, fallbackUsed, fallbackReason, retryAfterSeconds };
  }

  // ─── Batch Translation ───────────────────────────────────────────────────────

  async batchTranslate(
    userId: string,
    dto: BatchTranslateDto,
  ): Promise<Record<string, string>> {
    const keyAndModel = await this.getUserKeyAndModel(userId);
    if (!keyAndModel) {
      throw new BadRequestException({ code: ErrorCode.GEMINI_KEY_NOT_CONFIGURED, message: "Gemini API key not configured" });
    }

    const sourceLanguage: SourceLanguage = dto.sourceLanguage ?? "che";
    await this.assertSourceLanguageAccess(userId, sourceLanguage);

    const deduped = [
      ...new Set(dto.words.map((w) => w.trim().toLowerCase())),
    ].slice(0, 50);

    // Batch always translates to Russian (used for reader word highlighting)
    const cachedEntries = await this.prisma.aiTranslationCache.findMany({
      where: {
        lemma: { in: deduped },
        cacheType: AiCacheType.WORD_ONLY,
        sourceLanguage,
        targetLanguage: "ru",
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
      const prompt = this.buildBatchPrompt(uncached, sourceLanguage);
      const { text: raw } = await this.callGeminiSafe(
        userId,
        keyAndModel.apiKey,
        { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } },
        keyAndModel.model,
      );
      const parsed = this.parseBatchResponse(raw);
      if (parsed) {
        for (const [word, translation] of Object.entries(parsed)) {
          freshMap[word] = translation;
        }
        await Promise.allSettled(
          Object.entries(freshMap).map(([lemma, translation]) =>
            this.prisma.aiTranslationCache.upsert({
              where: {
                lemma_cacheType_sourceLanguage_targetLanguage: {
                  lemma,
                  cacheType: AiCacheType.WORD_ONLY,
                  sourceLanguage,
                  targetLanguage: "ru",
                },
              },
              create: {
                lemma,
                cacheType: AiCacheType.WORD_ONLY,
                sourceLanguage,
                targetLanguage: "ru",
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

  async saveRefinement(userId: string, dto: SaveRefinementDto) {
    const normalized = dto.word.trim().toLowerCase();
    const cacheType = dto.contextSentence
      ? AiCacheType.WORD_IN_CONTEXT
      : AiCacheType.WORD_ONLY;
    const targetLanguage: TranslationLanguage = dto.targetLanguage ?? "ru";
    const sourceLanguage: SourceLanguage = dto.sourceLanguage ?? "che";
    await this.assertSourceLanguageAccess(userId, sourceLanguage);

    const existing = await this.prisma.aiTranslationCache.findUnique({
      where: {
        lemma_cacheType_sourceLanguage_targetLanguage: {
          lemma: normalized,
          cacheType,
          sourceLanguage,
          targetLanguage,
        },
      },
      select: { id: true, status: true },
    });

    if (existing?.status === AiCacheStatus.APPROVED) return;

    await this.prisma.aiTranslationCache.upsert({
      where: {
        lemma_cacheType_sourceLanguage_targetLanguage: {
          lemma: normalized,
          cacheType,
          sourceLanguage,
          targetLanguage,
        },
      },
      create: {
        lemma: normalized,
        contextSentence: dto.contextSentence ?? null,
        cacheType,
        sourceLanguage,
        targetLanguage,
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
    if (!entry) throw new NotFoundException({ code: ErrorCode.AI_CACHE_ENTRY_NOT_FOUND, message: "Cache entry not found" });

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

  private resolveModel(raw: string | null | undefined): GeminiModel {
    if (raw && (SUPPORTED_GEMINI_MODELS as readonly string[]).includes(raw)) {
      return raw as GeminiModel;
    }
    return DEFAULT_GEMINI_MODEL as GeminiModel;
  }

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

  async getUserKeyAndModel(userId: string): Promise<{ apiKey: string; model: GeminiModel } | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { geminiApiKeyEncrypted: true, geminiModel: true },
    });
    if (!user?.geminiApiKeyEncrypted) return null;
    try {
      const apiKey = decryptApiKey(user.geminiApiKeyEncrypted);
      const model = this.resolveModel(user.geminiModel);
      return { apiKey, model };
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

  sanitize(input: string): string {
    return input.replace(/\\/g, "\\\\").replace(/"/g, '\\"').slice(0, 2000);
  }

  stripJsonFence(raw: string): string {
    return raw
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
  }

  private buildWordPrompt(
    word: string,
    targetLanguage: TranslationLanguage,
    sourceLanguage: SourceLanguage,
    context?: string,
  ): string {
    const safeWord = this.sanitize(word);
    const contextLine = context
      ? `\nContext sentence: "${this.sanitize(context)}"`
      : "";
    const langName = LANGUAGE_NAMES[targetLanguage];
    const sourceLangName = SOURCE_LANGUAGE_NAMES[sourceLanguage];
    const isRussian = targetLanguage === "ru";

    const russianGlossField = isRussian
      ? ""
      : `\n- "russianGloss": string (brief Russian meaning of the word for cross-check, 1-4 words)`;

    return `You are a ${sourceLangName} language assistant. Given the ${sourceLangName} word below${context ? " and its context sentence" : ""}, return a JSON object with these fields:
- "notChechen": boolean (true if the word is NOT ${sourceLangName})
- "translation": string (${langName} translation, considering context if provided)${russianGlossField}
- "transliteration": string (Latin transliteration of the ${sourceLangName} word)
- "partOfSpeech": string (part of speech in Russian, e.g. "существительное", "глагол")
- "example": string (a short usage example in ${sourceLangName} with ${langName} translation, format: "${sourceLangName} — ${langName}")

Word: "${safeWord}"${contextLine}

Return only valid JSON, no markdown.`;
  }

  private buildPhrasePrompt(
    phrase: string,
    targetLanguage: TranslationLanguage,
    sourceLanguage: SourceLanguage,
    contextSentence?: string,
  ): string {
    const langName = LANGUAGE_NAMES[targetLanguage];
    const sourceLangName = SOURCE_LANGUAGE_NAMES[sourceLanguage];
    const isRussian = targetLanguage === "ru";
    const contextLine = contextSentence
      ? `\nContext (surrounding sentence): "${this.sanitize(contextSentence)}"`
      : "";

    const russianGlossField = isRussian
      ? ""
      : `\n- "russianGloss": string (brief Russian meaning of the phrase for cross-check, empty string if not needed)`;

    return `You are a ${sourceLangName} language assistant. Translate the following ${sourceLangName} phrase into ${langName}${contextSentence ? ", using the surrounding sentence for context" : ""}. Return a JSON object:
- "translation": string (${langName} translation of the phrase)${russianGlossField}
- "notes": string (optional notes or comments, empty string if none)

Phrase: "${this.sanitize(phrase)}"${contextLine}

Return only valid JSON, no markdown.`;
  }

  private buildRefinePrompt(
    phrase: string,
    previousTranslation: string,
    hint: string,
    targetLanguage: TranslationLanguage,
    sourceLanguage: SourceLanguage,
  ): string {
    const langName = LANGUAGE_NAMES[targetLanguage];
    const sourceLangName = SOURCE_LANGUAGE_NAMES[sourceLanguage];
    const isRussian = targetLanguage === "ru";

    const russianGlossField = isRussian
      ? ""
      : `\n- "russianGloss": string (brief Russian meaning for cross-check, empty string if not needed)`;

    return `You are a ${sourceLangName} language assistant. You previously translated a ${sourceLangName} phrase into ${langName}, but the user says the translation is inaccurate and provides a clarifying hint.

Phrase: "${this.sanitize(phrase)}"
Previous translation: "${this.sanitize(previousTranslation)}"
User hint: "${this.sanitize(hint)}"

Based on the hint, provide a more accurate ${langName} translation. Return a JSON object:
- "translation": string (corrected ${langName} translation)${russianGlossField}
- "notes": string (explanation of the correction or additional context, empty string if none)

Return only valid JSON, no markdown.`;
  }

  private buildBatchPrompt(words: string[], sourceLanguage: SourceLanguage): string {
    const sourceLangName = SOURCE_LANGUAGE_NAMES[sourceLanguage];
    const list = words
      .map((w, i) => `${i + 1}. "${this.sanitize(w)}"`)
      .join("\n");
    return `You are a ${sourceLangName}-Russian language assistant. Translate each ${sourceLangName} word into Russian. Return a JSON object where each key is the exact ${sourceLangName} word and the value is its Russian translation (1-3 words). If a word is not ${sourceLangName}, omit it from the result.

Words:
${list}

Return only valid JSON, no markdown. Example: {"дуьне": "мир", "стаг": "человек"}`;
  }

  private parseBatchResponse(raw: string): Record<string, string> | null {
    try {
      const parsed = JSON.parse(this.stripJsonFence(raw));
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

  async callGemini(
    apiKey: string,
    body: Record<string, unknown>,
    model?: string,
    retries = 2,
  ): Promise<string> {
    const url = geminiUrl(apiKey, model);
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
      // 429 is handled by fallback — do not retry here
      if (res.status === 429) {
        const errBody = await res.text();
        const retryAfter = res.headers.get("Retry-After");
        const info = parseGeminiError(res.status, errBody, retryAfter);
        throw new GeminiRateLimitError(info.fallbackReason, info.retryAfterMs);
      }
      if (res.status !== 503 || attempt === retries) {
        const err = await res.text();
        throw new Error(`Gemini API error ${res.status}: ${err}`);
      }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
    throw new Error("Gemini API: exhausted retries");
  }

  async callGeminiWithFallback(
    userId: string,
    apiKey: string,
    body: Record<string, unknown>,
    model: string,
  ): Promise<{ text: string; fallbackUsed: boolean; fallbackReason?: FallbackReason; retryAfterSeconds?: number }> {
    const isFallbackModel = model === DEFAULT_GEMINI_MODEL;

    const callFallback = async (): Promise<string> => {
      try {
        return await this.callGemini(apiKey, body, DEFAULT_GEMINI_MODEL);
      } catch {
        throw new Error("gemini_fallback_failed");
      }
    };

    // Check quarantine — skip primary model if it's cooling down
    if (!isFallbackModel && quarantine.isActive(userId, model)) {
      const text = await callFallback();
      return { text, fallbackUsed: true, fallbackReason: "rate_limit" };
    }

    try {
      const text = await this.callGemini(apiKey, body, model);
      return { text, fallbackUsed: false };
    } catch (e) {
      if (e instanceof GeminiRateLimitError && !isFallbackModel) {
        quarantine.set(userId, model, e.retryAfterMs);
        const text = await callFallback();
        return {
          text,
          fallbackUsed: true,
          fallbackReason: e.reason,
          retryAfterSeconds: Math.ceil(e.retryAfterMs / 1000),
        };
      }
      throw e;
    }
  }

  async callGeminiSafe(
    userId: string,
    apiKey: string,
    body: Record<string, unknown>,
    model: string,
  ): Promise<{ text: string; fallbackUsed: boolean; fallbackReason?: FallbackReason; retryAfterSeconds?: number }> {
    try {
      return await this.callGeminiWithFallback(userId, apiKey, body, model);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("User location is not supported")) {
        throw new BadRequestException({ code: ErrorCode.LOCATION_NOT_SUPPORTED, message: "location_not_supported" });
      }
      throw new InternalServerErrorException({ code: ErrorCode.GEMINI_ERROR, message: "gemini_error" });
    }
  }

  private parseWordResponse(raw: string): {
    notChechen?: boolean;
    translation: string;
    russianGloss?: string;
    transliteration?: string;
    partOfSpeech?: string;
    baseForm?: string;
    nounClass?: string;
    example?: string;
  } | null {
    try {
      return JSON.parse(this.stripJsonFence(raw));
    } catch {
      return null;
    }
  }

  private parsePhraseResponse(
    raw: string,
  ): { translation: string; russianGloss?: string; notes?: string } | null {
    try {
      return JSON.parse(this.stripJsonFence(raw));
    } catch {
      return null;
    }
  }
}
