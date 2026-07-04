import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { Language } from "@prisma/client";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class AnalyzeWordDto {
  @ApiProperty({ description: "Word to analyze" })
  @IsString()
  word: string;

  @ApiPropertyOptional({
    description: "Language the word belongs to. Determines which suffix rules / lemma pool are used for analysis.",
    enum: Language,
    default: Language.CHE,
  })
  @IsOptional()
  @IsEnum(Language)
  language?: Language;
}
