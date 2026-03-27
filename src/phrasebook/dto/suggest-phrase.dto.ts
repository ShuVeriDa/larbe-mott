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

  @ApiPropertyOptional({ description: "Контекст или пояснение к фразе" })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  context?: string;

  @ApiPropertyOptional({ description: "ID категории, если известна" })
  @IsOptional()
  @IsString()
  categoryId?: string;
}
