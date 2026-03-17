import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString } from "class-validator";

export class CreateFeatureFlagDto {
  @ApiProperty({ description: "Unique feature flag key", example: "enableAITranslation" })
  @IsString()
  key: string;

  @ApiPropertyOptional({ description: "Human-readable description", example: "Enable AI translation feature" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: "Global flag state", default: false })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

