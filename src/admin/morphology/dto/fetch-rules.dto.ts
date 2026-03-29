import { ApiPropertyOptional } from "@nestjs/swagger";
import { Language, MorphRuleType } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class FetchRulesDto {
  @ApiPropertyOptional({ description: "Search in suffix and description" })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: "Filter by part of speech (e.g. NOUN, VERB, ADJ)" })
  @IsOptional()
  @IsString()
  pos?: string;

  @ApiPropertyOptional({ enum: MorphRuleType, description: "Filter by rule type" })
  @IsOptional()
  @IsEnum(MorphRuleType)
  type?: MorphRuleType;

  @ApiPropertyOptional({ enum: Language })
  @IsOptional()
  @IsEnum(Language)
  language?: Language;

  @ApiPropertyOptional({
    enum: ["all", "active", "inactive", "regex"],
    default: "all",
    description: "Status tab filter",
  })
  @IsOptional()
  @IsIn(["all", "active", "inactive", "regex"])
  status?: "all" | "active" | "inactive" | "regex";

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
