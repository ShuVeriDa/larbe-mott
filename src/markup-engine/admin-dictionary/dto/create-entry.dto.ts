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
  @IsString()
  word: string;

  @IsString()
  normalized: string;

  @ApiProperty({
    enum: Language,
    description: `${Language.CHE} | ${Language.RU}`,
  })
  @Matches(
    `^${Object.values(Language)
      .filter((v) => typeof v !== "number")
      .join("|")}$`,
    "i",
  )
  language: Language;

  @IsOptional()
  @IsString()
  partOfSpeech?: string;

  @IsString()
  translation: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  forms?: string[];
}
