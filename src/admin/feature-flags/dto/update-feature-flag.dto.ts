import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString } from "class-validator";

export class UpdateFeatureFlagDto {
  @ApiPropertyOptional({ description: "Feature flag key", example: "enableAITranslation" })
  @IsOptional()
  @IsString()
  key?: string;

  @ApiPropertyOptional({ description: "Human-readable description" })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ description: "Global flag state", example: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

