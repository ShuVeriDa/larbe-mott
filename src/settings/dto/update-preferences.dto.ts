import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ enum: ["LIGHT", "DARK", "SYSTEM"] })
  @IsOptional()
  @IsIn(["LIGHT", "DARK", "SYSTEM"])
  theme?: string;

  @ApiPropertyOptional({ enum: ["RU", "EN"] })
  @IsOptional()
  @IsIn(["RU", "EN"])
  uiLanguage?: string;

  @ApiPropertyOptional({ minimum: 12, maximum: 24 })
  @IsOptional()
  @IsInt()
  @Min(12)
  @Max(24)
  fontSize?: number;

  @ApiPropertyOptional({ enum: ["POPUP", "SIDEBAR", "BOTH"] })
  @IsOptional()
  @IsIn(["POPUP", "SIDEBAR", "BOTH"])
  popupMode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  highlightKnown?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showProgress?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoNextPage?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoAddOnClick?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showGrammar?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showExamples?: boolean;
}
