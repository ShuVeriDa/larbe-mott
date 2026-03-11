import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  Matches,
} from "class-validator";

import { ApiProperty } from "@nestjs/swagger";
import { Language } from "@prisma/client";

export class CreateEntryDto {
  @ApiProperty({ description: "Word or phrase (lemma)", example: "машин" })
  @IsString()
  word: string;

  @ApiProperty({
    description: "Normalized form for lookup",
    example: "машин",
  })
  @IsString()
  normalized: string;

  @ApiProperty({
    enum: Language,
    description: `Language code: ${Language.CHE} | ${Language.RU}`,
  })
  @Matches(
    `^${Object.values(Language)
      .filter((v) => typeof v !== "number")
      .join("|")}$`,
    "i",
  )
  language: Language;

  @ApiProperty({
    description: "Part of speech (optional)",
    example: "noun",
    required: false,
  })
  @IsOptional()
  @IsString()
  partOfSpeech?: string;

  @ApiProperty({ description: "Translation text", example: "car" })
  @IsString()
  translation: string;

  @ApiProperty({
    description: "Optional notes",
    required: false,
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    description: "Optional inflected forms (array of strings)",
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  forms?: string[];
}
