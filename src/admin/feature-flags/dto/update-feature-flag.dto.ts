import { FeatureFlagCategory, FeatureFlagEnvironment } from "@prisma/client";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from "class-validator";

export class UpdateFeatureFlagDto {
  @ApiPropertyOptional({ description: "Feature flag key", example: "reader.new_toolbar" })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, {
    message: "key must use dot notation like category.feature_name",
  })
  key?: string;

  @ApiPropertyOptional({ description: "Human-readable description" })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ description: "Global flag state", example: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({
    description: "Flag category",
    enum: FeatureFlagCategory,
  })
  @IsOptional()
  @IsEnum(FeatureFlagCategory)
  category?: FeatureFlagCategory;

  @ApiPropertyOptional({
    description: "Environments where this flag is active",
    enum: FeatureFlagEnvironment,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(FeatureFlagEnvironment, { each: true })
  environments?: FeatureFlagEnvironment[];

  @ApiPropertyOptional({
    description: "Rollout percentage (0-100)",
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  rolloutPercent?: number;
}

