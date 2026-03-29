import { FeatureFlagCategory, FeatureFlagEnvironment } from "@prisma/client";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
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
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

class ImportFeatureFlagItemDto {
  @ApiProperty({ example: "reader.new_toolbar" })
  @IsString()
  @Matches(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, {
    message: "key must use dot notation like category.feature_name",
  })
  key: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({ enum: FeatureFlagCategory })
  @IsOptional()
  @IsEnum(FeatureFlagCategory)
  category?: FeatureFlagCategory;

  @ApiPropertyOptional({
    enum: FeatureFlagEnvironment,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(FeatureFlagEnvironment, { each: true })
  environments?: FeatureFlagEnvironment[];

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  rolloutPercent?: number;
}

export enum ImportFeatureFlagsMode {
  UPSERT = "upsert",
  CREATE_ONLY = "create_only",
}

export class ImportFeatureFlagsDto {
  @ApiProperty({ type: [ImportFeatureFlagItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ImportFeatureFlagItemDto)
  items: ImportFeatureFlagItemDto[];

  @ApiPropertyOptional({
    enum: ImportFeatureFlagsMode,
    default: ImportFeatureFlagsMode.UPSERT,
  })
  @IsOptional()
  @IsEnum(ImportFeatureFlagsMode)
  mode?: ImportFeatureFlagsMode = ImportFeatureFlagsMode.UPSERT;

  @ApiPropertyOptional({
    description: "Validate only, no DB changes",
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean = false;
}

export { ImportFeatureFlagItemDto };
