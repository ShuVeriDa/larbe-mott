import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString } from "class-validator";

export class UserFeatureFlagItemDto {
  @ApiProperty({ description: "FeatureFlag record ID" })
  @IsString()
  flagId: string;

  @ApiProperty({ description: "Flag key (e.g. new_reader_ui)" })
  @IsString()
  key: string;

  @ApiPropertyOptional({ description: "Human-readable description", nullable: true })
  @IsString()
  @IsOptional()
  description: string | null;

  @ApiProperty({ description: "Global default value from FeatureFlag table" })
  @IsBoolean()
  globalValue: boolean;

  @ApiPropertyOptional({
    description: "Per-user override value. null = no override set",
    nullable: true,
  })
  @IsBoolean()
  @IsOptional()
  userOverride: boolean | null;

  @ApiProperty({ description: "Resolved value: userOverride ?? globalValue" })
  @IsBoolean()
  effectiveValue: boolean;
}
