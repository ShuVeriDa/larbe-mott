import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Language, MorphRuleType } from "@prisma/client";
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString } from "class-validator";

export class CreateMorphologyRuleDto {
  @ApiProperty({ description: "Suffix/pattern to match (e.g. \"нас\", \"^[а-яА-Я]+ну$\")" })
  @IsString()
  suffix: string;

  @ApiPropertyOptional({ description: "String to append to the stem to reconstruct the lemma (empty = stem as-is)" })
  @IsOptional()
  @IsString()
  add?: string;

  @ApiPropertyOptional({ description: "Part of speech: NOUN, VERB, ADJ, ADV, PRON" })
  @IsOptional()
  @IsString()
  pos?: string;

  @ApiPropertyOptional({ description: "Human-readable description" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: "Whether suffix is a regex pattern", default: false })
  @IsOptional()
  @IsBoolean()
  isRegex?: boolean;

  @ApiProperty({ enum: MorphRuleType, description: "Rule type: NOUN_CASE | PLURAL | VERB_PAST | SUFFIX | ENDING | PREFIX | REGEX" })
  @IsEnum(MorphRuleType)
  type: MorphRuleType;

  @ApiProperty({ enum: Language, description: "Language this rule applies to" })
  @IsEnum(Language)
  language: Language;

  @ApiPropertyOptional({ description: "Higher priority rules are tried first", default: 0 })
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
