import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Language } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class SuggestPhraseDto {
  @ApiProperty({ example: "Салам!" })
  @IsString()
  @MaxLength(500)
  original: string;

  @ApiProperty({ example: "Привет!" })
  @IsString()
  @MaxLength(500)
  translation: string;

  @ApiProperty({ enum: Language, example: Language.CHE })
  @IsEnum(Language)
  lang: Language;

  @ApiPropertyOptional({ description: "Context or additional notes for the phrase" })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  context?: string;

  @ApiPropertyOptional({ description: "Category ID, if known" })
  @IsOptional()
  @IsString()
  categoryId?: string;
}
