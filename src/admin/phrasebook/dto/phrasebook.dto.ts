import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Language } from "@prisma/client";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  IsArray,
} from "class-validator";
import { Type } from "class-transformer";

export class CreatePhrasebookCategoryDto {
  @ApiProperty({ example: "👋" })
  @IsString()
  emoji: string;

  @ApiProperty({ example: "Приветствия" })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdatePhrasebookCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emoji?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class PhraseWordDto {
  @ApiProperty()
  @IsString()
  original: string;

  @ApiProperty()
  @IsString()
  translation: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

export class PhraseExampleDto {
  @ApiProperty()
  @IsString()
  phrase: string;

  @ApiProperty()
  @IsString()
  translation: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  context?: string;
}

export class CreatePhrasebookPhraseDto {
  @ApiProperty()
  @IsString()
  categoryId: string;

  @ApiProperty()
  @IsString()
  original: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  transliteration?: string;

  @ApiProperty()
  @IsString()
  translation: string;

  @ApiProperty({ enum: Language })
  @IsEnum(Language)
  lang: Language;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ type: [PhraseWordDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PhraseWordDto)
  words?: PhraseWordDto[];

  @ApiPropertyOptional({ type: [PhraseExampleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PhraseExampleDto)
  examples?: PhraseExampleDto[];
}

export class UpdatePhrasebookPhraseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  original?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  transliteration?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  translation?: string;

  @ApiPropertyOptional({ enum: Language })
  @IsOptional()
  @IsEnum(Language)
  lang?: Language;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ type: [PhraseWordDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PhraseWordDto)
  words?: PhraseWordDto[];

  @ApiPropertyOptional({ type: [PhraseExampleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PhraseExampleDto)
  examples?: PhraseExampleDto[];
}
