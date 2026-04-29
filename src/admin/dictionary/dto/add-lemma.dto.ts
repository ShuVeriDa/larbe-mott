import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Language, Level } from "@prisma/client";

/** DTO for POST /admin/dictionary/entries/:entryId/lemmas — attach a new (or existing) lemma to an existing dictionary entry. */
export class AddLemmaDto {
  @ApiProperty({ description: "Base form (lemma) of the word", example: "мотт" })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  baseForm: string;

  @ApiProperty({ enum: Language, description: `Language code: ${Language.CHE} | ${Language.RU}` })
  @IsEnum(Language)
  language: Language;

  @ApiPropertyOptional({ description: "Part of speech", example: "verb" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  partOfSpeech?: string;

  @ApiPropertyOptional({ enum: Level, description: "CEFR level" })
  @IsOptional()
  @IsEnum(Level)
  level?: Level;

  @ApiPropertyOptional({ description: "Manual frequency", example: 1250 })
  @IsOptional()
  @IsInt()
  @Min(0)
  frequency?: number;

  @ApiPropertyOptional({ description: "Transliteration / latin spelling" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  transliteration?: string;

  @ApiPropertyOptional({ description: "Audio pronunciation URL" })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  audioUrl?: string;

  @ApiPropertyOptional({ description: "Declension class label" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  declensionClass?: string;

  @ApiPropertyOptional({ description: "Domain / topic" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  domain?: string;

  @ApiPropertyOptional({
    description: "Mark the new lemma's headword as primary for the entry (replaces existing primary).",
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
