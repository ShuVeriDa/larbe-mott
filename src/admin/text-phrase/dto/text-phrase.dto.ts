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

  @ApiProperty({ example: "in friendship" })
  @IsString()
  translation: string;

  @ApiProperty({ enum: Language })
  @IsEnum(Language)
  language: Language;

  @ApiPropertyOptional({ example: "Contextual note" })
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
  @ApiProperty({ description: "Text ID" })
  @IsUUID()
  textId: string;

  @ApiProperty({ description: "Page number (1-based)" })
  @IsInt()
  @Min(1)
  pageNumber: number;

  @ApiProperty({ description: "Position of the first phrase token (TextToken.position)" })
  @IsInt()
  @Min(0)
  startTokenPosition: number;

  @ApiProperty({ description: "Position of the last phrase token (TextToken.position, inclusive)" })
  @IsInt()
  @Min(0)
  endTokenPosition: number;
}

// Create a phrase and automatically find token positions by phrase text
export class CreatePhraseAutoOccurrenceDto {
  @ApiProperty({ example: "ловзуш хилла" })
  @IsString()
  original: string;

  @ApiProperty({ example: "they were playing" })
  @IsString()
  translation: string;

  @ApiProperty({ enum: Language })
  @IsEnum(Language)
  language: Language;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ description: "Text ID" })
  @IsUUID()
  textId: string;

  @ApiProperty({ description: "Page number (1-based)" })
  @IsInt()
  @Min(1)
  pageNumber: number;
}

// Create a phrase and immediately bind it to a position in the text (main editor scenario)
export class CreatePhraseWithOccurrenceDto {
  @ApiProperty({ example: "доттагIалла деш" })
  @IsString()
  original: string;

  @ApiProperty({ example: "in friendship" })
  @IsString()
  translation: string;

  @ApiProperty({ enum: Language })
  @IsEnum(Language)
  language: Language;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ description: "Text ID" })
  @IsUUID()
  textId: string;

  @ApiProperty({ description: "Page number (1-based)" })
  @IsInt()
  @Min(1)
  pageNumber: number;

  @ApiProperty({ description: "Position of the first phrase token" })
  @IsInt()
  @Min(0)
  startTokenPosition: number;

  @ApiProperty({ description: "Position of the last phrase token (inclusive)" })
  @IsInt()
  @Min(0)
  endTokenPosition: number;
}
