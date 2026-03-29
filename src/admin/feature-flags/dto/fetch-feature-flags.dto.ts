import { FeatureFlagCategory, FeatureFlagEnvironment } from "@prisma/client";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export enum FeatureFlagStatusFilter {
  ENABLED = "enabled",
  DISABLED = "disabled",
}

export class FetchFeatureFlagsDto {
  @ApiPropertyOptional({ description: "Search by key or description" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: FeatureFlagCategory })
  @IsOptional()
  @IsEnum(FeatureFlagCategory)
  category?: FeatureFlagCategory;

  @ApiPropertyOptional({ enum: FeatureFlagEnvironment })
  @IsOptional()
  @IsEnum(FeatureFlagEnvironment)
  environment?: FeatureFlagEnvironment;

  @ApiPropertyOptional({ enum: FeatureFlagStatusFilter })
  @IsOptional()
  @IsEnum(FeatureFlagStatusFilter)
  status?: FeatureFlagStatusFilter;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;
}
