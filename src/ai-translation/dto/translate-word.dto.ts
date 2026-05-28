import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { SUPPORTED_TRANSLATION_LANGUAGES } from "./translation-language";
import type { TranslationLanguage } from "./translation-language";

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
}
