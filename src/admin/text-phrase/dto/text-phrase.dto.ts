import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Language } from "@prisma/client";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from "class-validator";

export class CreateTextPhraseDto {
  @ApiProperty({ example: "доттагIалла деш" })
  @IsString()
  original: string;

  @ApiProperty({ example: "в дружбе" })
  @IsString()
  translation: string;

  @ApiProperty({ enum: Language })
  @IsEnum(Language)
  language: Language;

  @ApiPropertyOptional({ example: "Контекстное пояснение" })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateTextPhraseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  original?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  translation?: string;

  @ApiPropertyOptional({ enum: Language })
  @IsOptional()
  @IsEnum(Language)
  language?: Language;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateTextPhraseOccurrenceDto {
  @ApiProperty({ description: "ID текста" })
  @IsUUID()
  textId: string;

  @ApiProperty({ description: "Номер страницы (1-based)" })
  @IsInt()
  @Min(1)
  pageNumber: number;

  @ApiProperty({ description: "position первого токена фразы (TextToken.position)" })
  @IsInt()
  @Min(0)
  startTokenPosition: number;

  @ApiProperty({ description: "position последнего токена фразы (TextToken.position, inclusive)" })
  @IsInt()
  @Min(0)
  endTokenPosition: number;
}

// Создать фразу и автоматически найти позиции токенов по тексту фразы
export class CreatePhraseAutoOccurrenceDto {
  @ApiProperty({ example: "ловзуш хилла" })
  @IsString()
  original: string;

  @ApiProperty({ example: "играли" })
  @IsString()
  translation: string;

  @ApiProperty({ enum: Language })
  @IsEnum(Language)
  language: Language;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ description: "ID текста" })
  @IsUUID()
  textId: string;

  @ApiProperty({ description: "Номер страницы (1-based)" })
  @IsInt()
  @Min(1)
  pageNumber: number;
}

// Создать фразу и сразу привязать её к позиции в тексте (основной сценарий из редактора)
export class CreatePhraseWithOccurrenceDto {
  @ApiProperty({ example: "доттагIалла деш" })
  @IsString()
  original: string;

  @ApiProperty({ example: "в дружбе" })
  @IsString()
  translation: string;

  @ApiProperty({ enum: Language })
  @IsEnum(Language)
  language: Language;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ description: "ID текста" })
  @IsUUID()
  textId: string;

  @ApiProperty({ description: "Номер страницы (1-based)" })
  @IsInt()
  @Min(1)
  pageNumber: number;

  @ApiProperty({ description: "position первого токена фразы" })
  @IsInt()
  @Min(0)
  startTokenPosition: number;

  @ApiProperty({ description: "position последнего токена фразы (inclusive)" })
  @IsInt()
  @Min(0)
  endTokenPosition: number;
}
