import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { SUPPORTED_TRANSLATION_LANGUAGES } from "./translation-language";
import type { TranslationLanguage } from "./translation-language";

export class RefinePhraseDto {
  @ApiProperty({ description: "The original Chechen phrase" })
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  phrase: string;

  @ApiProperty({ description: "The first translation to refine" })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  previousTranslation: string;

  @ApiProperty({ description: "User hint about the correct meaning" })
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  hint: string;

  @ApiPropertyOptional({
    description: "Target language for the refined translation",
    enum: SUPPORTED_TRANSLATION_LANGUAGES,
    default: "ru",
  })
  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_TRANSLATION_LANGUAGES)
  targetLanguage?: TranslationLanguage;
}
