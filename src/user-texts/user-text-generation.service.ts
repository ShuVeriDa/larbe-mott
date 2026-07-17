import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { GeneratedTextContentType, Language } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { ErrorCode } from "src/common/errors/error-codes";
import { AiTranslationService } from "src/ai-translation/ai-translation.service";
import { GenreService } from "src/genre/genre.service";
import type { GenerateUserTextDto, GenerationDifficulty, GenerationGrammarFocus, GenerationTopic } from "./dto/generate-user-text.dto";
import type { GeneratedTextResponseDto, TipTapDoc, TipTapNode } from "./dto/generated-text-response.dto";

const LANGUAGE_NAMES: Record<Language, string> = {
  CHE: "Chechen",
  RU: "Russian",
  AR: "Arabic",
  EN: "English",
};

const articleFor = (languageName: string): "a" | "an" => (/^[aeiou]/i.test(languageName) ? "an" : "a");

// Инструкции для промпта пишутся на английском независимо от языка генерации —
// та же практика, что и buildWordPrompt/buildPhrasePrompt в AiTranslationService.
const TOPIC_DESCRIPTIONS: Record<GenerationTopic, string> = {
  FAMILY: "family life",
  FOOD: "food",
  TRAVEL: "travel",
  NATURE: "nature",
  CITY: "city life",
  WORK: "work",
  HOLIDAYS: "holidays and celebrations",
  FRIENDSHIP: "friendship",
  CUSTOM: "",
};

const GRAMMAR_FOCUS_DESCRIPTIONS: Record<GenerationGrammarFocus, string> = {
  PAST_TENSE: "emphasize past tense forms throughout the text",
  PRESENT_TENSE: "emphasize present tense forms throughout the text",
  FUTURE_TENSE: "emphasize future tense forms throughout the text",
  PLURAL_FORMATION: "emphasize plural forms of nouns throughout the text",
  COMPARATIVES: "use comparative and superlative constructions where natural",
  QUESTIONS: "include several question sentences",
  NEGATION: "include several negated sentences",
  CONDITIONALS: "include conditional ('if... then...') constructions",
  POSSESSIVES: "use possessive constructions ('my', 'his house', etc.) where natural",
  CUSTOM: "",
  NONE: "",
};

interface DictionaryWord {
  word: string;
  language: Language | null;
}

interface GenreOption {
  id: string;
  name: string;
}

const MAX_DESCRIPTION_LENGTH = 500;

interface ParsedProseResponse {
  paragraphs: string[];
  usedWords: string[];
  description: string | null;
  genreId: unknown;
}

interface ParsedDialogueResponse {
  lines: { speaker: string; text: string }[];
  usedWords: string[];
  description: string | null;
  genreId: unknown;
}

@Injectable()
export class UserTextGenerationService {
  private readonly logger = new Logger(UserTextGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiTranslationService: AiTranslationService,
    private readonly genreService: GenreService,
  ) {}

  async generate(userId: string, dto: GenerateUserTextDto): Promise<GeneratedTextResponseDto> {
    const keyAndModel = await this.aiTranslationService.getUserKeyAndModel(userId);
    if (!keyAndModel) {
      throw new BadRequestException({
        code: ErrorCode.GEMINI_KEY_NOT_CONFIGURED,
        message: "Gemini API key not configured",
      });
    }

    const [dictionaryWords, genres] = await Promise.all([
      this.resolveDictionaryWords(userId, dto.dictionaryEntryIds),
      this.genreService.getAllGenres(),
    ]);
    const customWords = (dto.customWords ?? []).map((w) => this.aiTranslationService.sanitize(w));

    const prompt = this.buildGenerationPrompt({
      dictionaryWords,
      customWords,
      contentType: dto.contentType,
      language: dto.language,
      targetLength: dto.targetLength,
      difficulty: dto.difficulty,
      topic: dto.topic,
      customTopic: dto.customTopic,
      tone: dto.tone,
      dialogueCharacterCount: dto.dialogueCharacterCount,
      grammarFocus: dto.grammarFocus,
      customGrammarFocus: dto.customGrammarFocus,
      genres,
    });

    const { text: raw } = await this.aiTranslationService.callGeminiSafe(
      userId,
      keyAndModel.apiKey,
      { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } },
      keyAndModel.model,
    );

    const parsed = this.parseGenerationResponse(raw, dto.contentType);
    if (!parsed) {
      this.logger.warn(`Failed to parse Gemini generation response for contentType=${dto.contentType}: ${raw}`);
      throw new BadRequestException({ code: ErrorCode.GEMINI_PARSE_ERROR, message: "Could not parse Gemini response" });
    }

    const validGenreIds = new Set(genres.map((g) => g.id));

    return {
      content: this.toTipTapDoc(parsed, dto.contentType),
      usedWords: parsed.usedWords,
      description: parsed.description,
      genreId: this.resolveGenreId(parsed.genreId, validGenreIds),
    };
  }

  private async resolveDictionaryWords(userId: string, dictionaryEntryIds: string[] | undefined): Promise<DictionaryWord[]> {
    if (!dictionaryEntryIds || dictionaryEntryIds.length === 0) return [];
    const uniqueIds = [...new Set(dictionaryEntryIds)];

    const entries = await this.prisma.userDictionaryEntry.findMany({
      where: { userId, id: { in: uniqueIds } },
      include: { lemma: { select: { language: true } } },
    });

    return entries.map((entry) => ({
      word: this.aiTranslationService.sanitize(entry.word),
      language: entry.lemma?.language ?? null,
    }));
  }

  private buildGenerationPrompt(params: {
    dictionaryWords: DictionaryWord[];
    customWords: string[];
    contentType: GeneratedTextContentType;
    language: Language;
    targetLength: number;
    difficulty?: GenerationDifficulty;
    topic: GenerationTopic;
    customTopic?: string;
    tone?: string;
    dialogueCharacterCount?: number;
    grammarFocus?: GenerationGrammarFocus;
    customGrammarFocus?: string;
    genres: GenreOption[];
  }): string {
    const targetLangName = LANGUAGE_NAMES[params.language];
    const article = articleFor(targetLangName);

    const lines: string[] = [];
    lines.push(`You are ${article} ${targetLangName} language teaching assistant. Generate ${article} ${targetLangName}-language text for a language learner.`);
    lines.push("");
    lines.push(`Target length: approximately ${params.targetLength} words.`);
    if (params.difficulty) {
      lines.push(`Difficulty level (CEFR-like): ${params.difficulty}.`);
    }

    const topicDescription =
      params.topic === "CUSTOM"
        ? this.aiTranslationService.sanitize(params.customTopic ?? "")
        : TOPIC_DESCRIPTIONS[params.topic];
    lines.push(`Topic: ${topicDescription}`);

    if (params.tone) {
      lines.push(`Tone: ${params.tone.toLowerCase()}`);
    }

    if (params.contentType === GeneratedTextContentType.DIALOGUE) {
      lines.push("Format: a dialogue between characters.");
      const characterCount = params.dialogueCharacterCount ?? 2;
      lines.push(`Include exactly ${characterCount} characters in the dialogue.`);
    } else if (params.contentType === GeneratedTextContentType.STORY) {
      lines.push("Format: a short story with a simple plot.");
    } else {
      lines.push("Format: a plain connected text (not a dialogue).");
    }

    if (params.grammarFocus && params.grammarFocus !== "NONE") {
      const grammarInstruction =
        params.grammarFocus === "CUSTOM"
          ? this.aiTranslationService.sanitize(params.customGrammarFocus ?? "")
          : GRAMMAR_FOCUS_DESCRIPTIONS[params.grammarFocus];
      if (grammarInstruction) {
        lines.push(`Grammar focus: ${grammarInstruction}.`);
      }
    }

    const hasWordsToLearn = params.dictionaryWords.length > 0 || params.customWords.length > 0;

    if (params.dictionaryWords.length > 0) {
      const withLanguage = params.dictionaryWords.filter((w) => w.language !== null);
      const withoutLanguage = params.dictionaryWords.filter((w) => w.language === null);
      const wordList = [
        ...withLanguage.map((w) => `${w.word} (${LANGUAGE_NAMES[w.language as Language]})`),
        ...withoutLanguage.map((w) => w.word),
      ];
      lines.push("");
      lines.push("Vocabulary words to include (with source language where known):");
      lines.push(wordList.map((w, i) => `${i + 1}. ${w}`).join("\n"));
      lines.push(
        "For each vocabulary word, keep its language as-is if it matches the target language (do not translate it), otherwise use its meaning/translation naturally in the text. Either way, you may inflect the word into different grammatical forms across its repetitions (see repetition guidance below) — \"as-is\" refers to language/meaning, not a fixed surface form.",
      );
    }

    if (params.customWords.length > 0) {
      lines.push("");
      lines.push("Additional words to include:");
      lines.push(params.customWords.map((w, i) => `${i + 1}. ${w}`).join("\n"));
    }

    // Спейсд-репетишн: слово, встреченное 1 раз, почти не закрепляется в памяти.
    // Повторение в разных контекстах/формах — то, что реально помогает запомнить.
    // Приоритет ниже, чем targetLength — при малой длине текста менять число повторений,
    // не длину, иначе конфликт "30 слов х 3 повторения" vs "targetLength: 30" неразрешим.
    if (hasWordsToLearn) {
      lines.push("");
      lines.push("These words are for vocabulary learning — repetition is essential for memorization:");
      lines.push(
        "- Try to use every listed word at least 3 times each, in different sentences and different contexts throughout the text (not clustered together).",
      );
      lines.push(
        "- The target length above is the hard constraint — if fitting 3+ repetitions of every word would force the text far beyond the target length, prioritize the target length and reduce the repetition count per word instead (repeat as many words as many times as reasonably fits).",
      );
      lines.push(
        "- Where the target language's grammar allows it, vary the grammatical form of each repeated word (different cases, tenses, singular/plural, etc.) rather than repeating the exact same word form every time — this helps the learner recognize the word in context, not just memorize one fixed form.",
      );
      lines.push(
        "- Spread the repetitions evenly across the whole text — do not use all repetitions of a word in the first paragraph and none later.",
      );
      lines.push(
        "- End the text with a short closing sentence or summary that naturally reuses several of the key vocabulary words one more time, reinforcing them for the reader.",
      );
    }

    // Genre names come from an admin-managed table, not user input — same trust level as
    // LANGUAGE_NAMES/TOPIC_DESCRIPTIONS above, so no sanitize() here. Revisit if genres
    // ever become user-suggested/editable by non-admins.
    if (params.genres.length > 0) {
      lines.push("");
      lines.push("Available genres (choose the single best-fitting one by id, or omit if none fits well):");
      lines.push(params.genres.map((g) => `${g.id}: ${g.name}`).join("\n"));
    }

    lines.push("");
    lines.push("Also include in the JSON response:");
    lines.push(
      `- "description": a short 2-3 sentence description of the text in ${targetLangName}, summarizing its topic/content (for a library catalog card)`,
    );
    lines.push(
      params.genres.length > 0
        ? '- "genreId": the id (exact string from the genre list above) of the single best-fitting genre, or null if none fits well'
        : '- "genreId": null (no genres available)',
    );

    lines.push("");
    const usedWordsInstruction =
      '"usedWords" lists which of the provided vocabulary/additional words were actually used in the text — use the exact base form from the provided lists for each word, even if you used a different grammatical form of it in the actual text (e.g. plural, past tense, a different case).';
    if (params.contentType === GeneratedTextContentType.DIALOGUE) {
      lines.push(
        `Return a JSON object: { "lines": [{ "speaker": string, "text": string }], "usedWords": string[], "description": string, "genreId": string | null }. ${usedWordsInstruction}`,
      );
    } else {
      lines.push(
        `Return a JSON object: { "paragraphs": string[], "usedWords": string[], "description": string, "genreId": string | null }. ${usedWordsInstruction}`,
      );
    }
    lines.push("Return only valid JSON, no markdown.");

    return lines.join("\n");
  }

  private extractDescription(parsed: Record<string, unknown>): string | null {
    if (typeof parsed.description !== "string" || parsed.description.length === 0) return null;
    return parsed.description.slice(0, MAX_DESCRIPTION_LENGTH);
  }

  private parseGenerationResponse(
    raw: string,
    contentType: GeneratedTextContentType,
  ): ParsedProseResponse | ParsedDialogueResponse | null {
    try {
      const parsed = JSON.parse(this.aiTranslationService.stripJsonFence(raw)) as Record<string, unknown>;
      const description = this.extractDescription(parsed);
      const genreId = parsed.genreId;

      if (contentType === GeneratedTextContentType.DIALOGUE) {
        if (!Array.isArray(parsed.lines)) return null;
        const lines = parsed.lines.filter(
          (l): l is { speaker: string; text: string } =>
            typeof l === "object" &&
            l !== null &&
            typeof (l as { speaker?: unknown }).speaker === "string" &&
            (l as { speaker: string }).speaker.length > 0 &&
            typeof (l as { text?: unknown }).text === "string" &&
            (l as { text: string }).text.length > 0,
        );
        if (lines.length === 0) return null;
        const usedWords = Array.isArray(parsed.usedWords) ? parsed.usedWords.filter((w): w is string => typeof w === "string") : [];
        return { lines, usedWords, description, genreId };
      }

      if (!Array.isArray(parsed.paragraphs)) return null;
      const paragraphs = parsed.paragraphs.filter((p): p is string => typeof p === "string" && p.length > 0);
      if (paragraphs.length === 0) return null;
      const usedWords = Array.isArray(parsed.usedWords) ? parsed.usedWords.filter((w): w is string => typeof w === "string") : [];
      return { paragraphs, usedWords, description, genreId };
    } catch {
      return null;
    }
  }

  private resolveGenreId(rawGenreId: unknown, validGenreIds: Set<string>): string | null {
    if (typeof rawGenreId !== "string") return null;
    return validGenreIds.has(rawGenreId) ? rawGenreId : null;
  }

  private toTipTapDoc(
    parsed: ParsedProseResponse | ParsedDialogueResponse,
    contentType: GeneratedTextContentType,
  ): TipTapDoc {
    if (contentType === GeneratedTextContentType.DIALOGUE && "lines" in parsed) {
      const content: TipTapNode[] = parsed.lines.map((line) => ({
        type: "paragraph",
        content: [{ type: "text", text: `${line.speaker}: ${line.text}` }],
      }));
      return { type: "doc", content };
    }

    if ("paragraphs" in parsed) {
      const content: TipTapNode[] = parsed.paragraphs.map((paragraph) => ({
        type: "paragraph",
        content: [{ type: "text", text: paragraph }],
      }));
      return { type: "doc", content };
    }

    return { type: "doc", content: [] };
  }
}
