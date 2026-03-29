import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class FetchFeatureFlagOverridesDto {
  @ApiPropertyOptional({ description: "Search by user email/name or flag key" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: "Filter by feature flag id" })
  @IsOptional()
  @IsString()
  flagId?: string;

  @ApiPropertyOptional({
    description: "Filter by override value",
    examples: ["true", "false", "on", "off"],
  })
  @IsOptional()
  @IsString()
  @IsIn(["true", "false", "on", "off", "1", "0"])
  isEnabled?: string;

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
