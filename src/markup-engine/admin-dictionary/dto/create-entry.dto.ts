import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
} from "class-validator";

import { Language } from "@prisma/client";

export class CreateEntryDto {
  @IsString()
  word: string;

  @IsString()
  normalized: string;

  @IsEnum(Language)
  language: Language;

  @IsOptional()
  @IsString()
  partOfSpeech?: string;

  @IsString()
  translation: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  forms?: string[];
}
