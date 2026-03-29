import { ApiPropertyOptional } from "@nestjs/swagger";
import { Language, MorphRuleType } from "@prisma/client";
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString } from "class-validator";

export class UpdateMorphologyRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  suffix?: string;

  @ApiPropertyOptional({ description: "String to append to the stem to reconstruct the lemma" })
  @IsOptional()
  @IsString()
  add?: string;

  @ApiPropertyOptional({ description: "Part of speech: NOUN, VERB, ADJ, ADV, PRON" })
  @IsOptional()
  @IsString()
  pos?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRegex?: boolean;

  @ApiPropertyOptional({ enum: MorphRuleType })
  @IsOptional()
  @IsEnum(MorphRuleType)
  type?: MorphRuleType;

  @ApiPropertyOptional({ enum: Language })
  @IsOptional()
  @IsEnum(Language)
  language?: Language;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
