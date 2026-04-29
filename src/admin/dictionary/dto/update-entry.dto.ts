import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Level } from "@prisma/client";

/** DTO for PATCH /admin/dictionary/:id — update lemma, translation, notes, forms, lemma metadata. */
export class PatchEntryDto {
  @ApiPropertyOptional({
    description: "Base form (lemma) of the word",
    example: "машин",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  baseForm?: string;

  @ApiPropertyOptional({
    description: "Part of speech",
    example: "noun",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  partOfSpeech?: string;

  @ApiPropertyOptional({
    description: "Translation text",
    example: "car",
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  translation?: string;

  @ApiPropertyOptional({ enum: Level, description: "CEFR level" })
  @IsOptional()
  @IsEnum(Level)
  level?: Level;

  @ApiPropertyOptional({
    description: "Manual frequency (corpus rank). Pass null to clear.",
    example: 1250,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  frequency?: number | null;

  @ApiPropertyOptional({ description: "Transliteration / latin spelling" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  transliteration?: string | null;

  @ApiPropertyOptional({ description: "URL of the audio pronunciation file" })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  audioUrl?: string | null;

  @ApiPropertyOptional({ description: "Declension class (free-form label)" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  declensionClass?: string | null;

  @ApiPropertyOptional({ description: "Domain / topic (free-form)" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  domain?: string | null;

  @ApiPropertyOptional({
    description: "Notes",
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: "Inflected forms (replaces all existing forms for this lemma)",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  forms?: string[];
}
