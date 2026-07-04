import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { SUPPORTED_SOURCE_LANGUAGES, SUPPORTED_TRANSLATION_LANGUAGES } from "./translation-language";
import type { SourceLanguage, TranslationLanguage } from "./translation-language";

export class TranslateWordDto {
  @ApiProperty({ description: "The Chechen word (lemma/surface form) to translate" })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  word: string;

  @ApiPropertyOptional({ description: "Context sentence containing the word" })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  contextSentence?: string;

  @ApiPropertyOptional({
    description: "Target language for translation",
    enum: SUPPORTED_TRANSLATION_LANGUAGES,
    default: "ru",
  })
  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_TRANSLATION_LANGUAGES)
  targetLanguage?: TranslationLanguage;

  @ApiPropertyOptional({
    description: "Source language of the word being translated",
    enum: SUPPORTED_SOURCE_LANGUAGES,
    default: "che",
  })
  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_SOURCE_LANGUAGES)
  sourceLanguage?: SourceLanguage;
}
