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

  @ApiPropertyOptional({ enum: ["RU", "EN", "AR"] })
  @IsOptional()
  @IsIn(["RU", "EN", "AR"])
  translationLanguage?: string;

  @ApiPropertyOptional({
    description:
      "In-app review reminder on the home page (shows the number of words due for review).",
  })
  @IsOptional()
  @IsBoolean()
  showReviewReminder?: boolean;

  @ApiPropertyOptional({
    description:
      "Premium feature: enable curated learning decks (NEW / OLD / RETIRED). Setting to true requires an active Premium subscription.",
  })
  @IsOptional()
  @IsBoolean()
  enableDecks?: boolean;

  // ─── Reader typography ────────────────────────────────────────────────────────

  @ApiPropertyOptional({ enum: ["sans", "golos", "serif", "lora", "merriweather", "pt-serif", "source-serif", "mono"] })
  @IsOptional()
  @IsIn(["sans", "golos", "serif", "lora", "merriweather", "pt-serif", "source-serif", "mono"])
  readerFontFamily?: string;

  @ApiPropertyOptional({ enum: ["xs", "sm", "md", "lg", "xl"] })
  @IsOptional()
  @IsIn(["xs", "sm", "md", "lg", "xl"])
  readerFontSize?: string;

  @ApiPropertyOptional({ enum: ["xs", "sm", "md", "lg", "full"] })
  @IsOptional()
  @IsIn(["xs", "sm", "md", "lg", "full"])
  readerColumnWidth?: string;

  @ApiPropertyOptional({ enum: ["compact", "normal", "wide"] })
  @IsOptional()
  @IsIn(["compact", "normal", "wide"])
  readerPagePadding?: string;

  @ApiPropertyOptional({ enum: ["compact", "normal", "relaxed"] })
  @IsOptional()
  @IsIn(["compact", "normal", "relaxed"])
  readerLineHeight?: string;

  @ApiPropertyOptional({ enum: ["tight", "normal", "wide"] })
  @IsOptional()
  @IsIn(["tight", "normal", "wide"])
  readerLetterSpacing?: string;

  @ApiPropertyOptional({ enum: ["none", "compact", "normal", "relaxed"] })
  @IsOptional()
  @IsIn(["none", "compact", "normal", "relaxed"])
  readerParagraphSpacing?: string;

  @ApiPropertyOptional({ enum: ["default", "sepia", "custom"] })
  @IsOptional()
  @IsIn(["default", "sepia", "custom"])
  readerTheme?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  readerBgColor?: string;
}
