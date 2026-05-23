import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional } from "class-validator";

export class UpdateTokenizationSettingsDto {
  @ApiPropertyOptional({ description: "Auto-tokenize on text save" })
  @IsBoolean()
  @IsOptional()
  autoTokenize?: boolean;

  @ApiPropertyOptional({ description: "Normalize words to base form" })
  @IsBoolean()
  @IsOptional()
  normalization?: boolean;

  @ApiPropertyOptional({ description: "Morphological analysis by rules" })
  @IsBoolean()
  @IsOptional()
  morphAnalysis?: boolean;

  @ApiPropertyOptional({ description: "Queries to external online API" })
  @IsBoolean()
  @IsOptional()
  onlineDictionaries?: boolean;
}
