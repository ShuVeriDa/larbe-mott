import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Language, MorphRuleType } from "@prisma/client";
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString } from "class-validator";

export class CreateMorphologyRuleDto {
  @ApiProperty({ description: "Suffix to strip (e.g. \"ан\", \"аш\")" })
  @IsString()
  suffix: string;

  @ApiProperty({ enum: MorphRuleType, description: "Rule type: NOUN_CASE | PLURAL | VERB_PAST" })
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
