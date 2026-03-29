import { FeatureFlagHistoryEventType } from "@prisma/client";
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

export class FetchFeatureFlagHistoryDto {
  @ApiPropertyOptional({ description: "Search by flag key, action details or actor fields" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: FeatureFlagHistoryEventType })
  @IsOptional()
  @IsEnum(FeatureFlagHistoryEventType)
  eventType?: FeatureFlagHistoryEventType;

  @ApiPropertyOptional({ description: "Filter by actor admin user id" })
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiPropertyOptional({ description: "Filter by feature flag id" })
  @IsOptional()
  @IsString()
  flagId?: string;

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
