import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class SaveGeminiKeyDto {
  @ApiPropertyOptional({ description: "Gemini API key. Send empty string or null to delete." })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  apiKey?: string | null;
}
