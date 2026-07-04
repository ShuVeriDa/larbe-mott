import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { SUPPORTED_SOURCE_LANGUAGES, SUPPORTED_TRANSLATION_LANGUAGES } from "./translation-language";
import type { SourceLanguage, TranslationLanguage } from "./translation-language";

export class SaveRefinementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  word: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  translation: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  contextSentence?: string;

  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_TRANSLATION_LANGUAGES)
  targetLanguage?: TranslationLanguage;

  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_SOURCE_LANGUAGES)
  sourceLanguage?: SourceLanguage;
}
