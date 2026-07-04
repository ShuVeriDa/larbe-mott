import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { SUPPORTED_SOURCE_LANGUAGES, SUPPORTED_TRANSLATION_LANGUAGES } from "./translation-language";
import type { SourceLanguage, TranslationLanguage } from "./translation-language";

export class TranslatePhraseDto {
  @ApiProperty({ description: "The Chechen phrase to translate" })
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  phrase: string;

  @ApiPropertyOptional({ description: "Surrounding sentence for context" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
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
    description: "Source language of the phrase being translated",
    enum: SUPPORTED_SOURCE_LANGUAGES,
    default: "che",
  })
  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_SOURCE_LANGUAGES)
  sourceLanguage?: SourceLanguage;
}
