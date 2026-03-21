import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Language } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, IsString } from "class-validator";

export class CreateLemmaDto {
  @ApiProperty({ description: "Base form of the word" })
  @IsString()
  baseForm: string;

  @ApiProperty({ enum: Language })
  @IsEnum(Language)
  language: Language;

  @ApiPropertyOptional({ description: "Part of speech (noun, verb, adj...)" })
  @IsOptional()
  @IsString()
  partOfSpeech?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  frequency?: number;
}
