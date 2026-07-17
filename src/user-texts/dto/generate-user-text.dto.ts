import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidateIf,
} from "class-validator";
import type { ValidationArguments, ValidatorConstraintInterface } from "class-validator";
import { ValidatorConstraint } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { GeneratedTextContentType, GenerationTone, Language } from "@prisma/client";

export const MAX_GENERATION_WORDS = 30;

// Хардкод-список тем — нет переиспользуемого справочника на бэкенде.
// Синхронизирован с фронтенд-конфигом src/features/generate-user-text/lib/topic-options.ts (Step 6) —
// единственный источник истины здесь: бэкенд валидирует, фронтенд просто отображает те же ключи.
export const GENERATION_TOPICS = [
  "FAMILY",
  "FOOD",
  "TRAVEL",
  "NATURE",
  "CITY",
  "WORK",
  "HOLIDAYS",
  "FRIENDSHIP",
  "CUSTOM",
] as const;
export type GenerationTopic = (typeof GENERATION_TOPICS)[number];

// Языково-нейтральный список грамматических тем (существуют хотя бы приблизительно во всех
// поддерживаемых языках CHE/RU/AR/EN). Языково-специфичные темы (например "эргативный падеж"
// для чеченского, "артикли" для английского) идут через CUSTOM + customGrammarFocus.
export const GENERATION_GRAMMAR_FOCUS = [
  "PAST_TENSE",
  "PRESENT_TENSE",
  "FUTURE_TENSE",
  "PLURAL_FORMATION",
  "COMPARATIVES",
  "QUESTIONS",
  "NEGATION",
  "CONDITIONALS",
  "POSSESSIVES",
  "CUSTOM",
  "NONE",
] as const;
export type GenerationGrammarFocus = (typeof GENERATION_GRAMMAR_FOCUS)[number];

// Полная шкала CEFR — генерация не попадает в общую библиотеку (там тексты размечены
// упрощённо A/B/C), поэтому здесь можно себе позволить точность до подуровня, включая C1/C2.
export const GENERATION_DIFFICULTIES = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type GenerationDifficulty = (typeof GENERATION_DIFFICULTIES)[number];

@ValidatorConstraint({ name: "combinedWordCountWithinLimit", async: false })
class CombinedWordCountWithinLimitConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as GenerateUserTextDto;
    const combined = (dto.dictionaryEntryIds?.length ?? 0) + (dto.customWords?.length ?? 0);
    return combined <= MAX_GENERATION_WORDS;
  }

  defaultMessage(): string {
    return `dictionaryEntryIds and customWords combined must not exceed ${MAX_GENERATION_WORDS} items`;
  }
}

// Мягкая эвристика против prompt injection: элемент customWords — это слово/короткое
// словосочетание, не предложение-инструкция. sanitize() (JSON-экранирование) — не защита
// от этого, см. security checklist Step 2 плана.
const MAX_WORDS_PER_CUSTOM_WORD_ENTRY = 3;

@ValidatorConstraint({ name: "looksLikeWordNotSentence", async: false })
class LooksLikeWordNotSentenceConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!Array.isArray(value)) return true;
    return value.every((entry) => typeof entry === "string" && entry.trim().split(/\s+/).length <= MAX_WORDS_PER_CUSTOM_WORD_ENTRY);
  }

  defaultMessage(): string {
    return `each customWords entry must be a single word or short phrase (max ${MAX_WORDS_PER_CUSTOM_WORD_ENTRY} words)`;
  }
}

export class GenerateUserTextDto {
  @ApiProperty({ enum: Language, description: "Язык генерируемого текста" })
  @IsEnum(Language)
  language: Language;

  @ApiProperty({ enum: GeneratedTextContentType })
  @IsEnum(GeneratedTextContentType)
  contentType: GeneratedTextContentType;

  @ApiProperty({ enum: GENERATION_TOPICS, description: "Тема текста; CUSTOM требует customTopic" })
  @IsIn(GENERATION_TOPICS)
  topic: GenerationTopic;

  @ApiPropertyOptional({ description: "Своя тема текста (обязательна, если topic === 'CUSTOM')" })
  @ValidateIf((o: GenerateUserTextDto) => o.topic === "CUSTOM")
  @IsString()
  @MaxLength(200)
  customTopic?: string;

  @ApiPropertyOptional({ enum: GenerationTone, description: "Тон текста, по умолчанию NEUTRAL" })
  @IsOptional()
  @IsEnum(GenerationTone)
  tone?: GenerationTone;

  @ApiPropertyOptional({
    description: "Число персонажей — только для contentType === DIALOGUE",
    minimum: 2,
    maximum: 4,
  })
  @ValidateIf((o: GenerateUserTextDto) => o.contentType === GeneratedTextContentType.DIALOGUE)
  @IsInt()
  @Min(2)
  @Max(4)
  dialogueCharacterCount?: number;

  @ApiPropertyOptional({
    enum: GENERATION_GRAMMAR_FOCUS,
    description: "Грамматическая конструкция для акцента в тексте, по умолчанию NONE",
  })
  @IsOptional()
  @IsIn(GENERATION_GRAMMAR_FOCUS)
  grammarFocus?: GenerationGrammarFocus;

  @ApiPropertyOptional({
    description:
      "Своя грамматическая тема (обязательна, если grammarFocus === 'CUSTOM'), напр. 'артикли' для английского или 'эргативный падеж' для чеченского",
  })
  @ValidateIf((o: GenerateUserTextDto) => o.grammarFocus === "CUSTOM")
  @IsString()
  @MaxLength(200)
  customGrammarFocus?: string;

  @ApiPropertyOptional({
    description: "ID записей UserDictionaryEntry пользователя, которые нужно включить (НЕ lemmaId)",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_GENERATION_WORDS)
  @IsString({ each: true })
  @Validate(CombinedWordCountWithinLimitConstraint)
  dictionaryEntryIds?: string[];

  @ApiPropertyOptional({ description: "Свои слова (не из словаря), макс. 30", type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_GENERATION_WORDS)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  @Validate(LooksLikeWordNotSentenceConstraint)
  customWords?: string[];

  @ApiProperty({ description: "Целевая длина в словах", minimum: 30, maximum: 600 })
  @IsInt()
  @Min(30)
  @Max(600)
  targetLength: number;

  @ApiPropertyOptional({ enum: GENERATION_DIFFICULTIES, description: "CEFR-подобный уровень сложности" })
  @IsOptional()
  @IsIn(GENERATION_DIFFICULTIES)
  difficulty?: GenerationDifficulty;
}
