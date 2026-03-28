import { IsArray, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Level } from "@prisma/client";

/** DTO for PATCH /admin/dictionary/:id — update lemma, translation, notes, forms. */
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
