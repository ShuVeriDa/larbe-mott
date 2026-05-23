import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PlanType } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { PlanLimits } from "src/billing/plan-limits";

export class CreatePlanDto {
  @ApiProperty({ description: "Unique plan code", example: "PRO_MONTHLY" })
  @IsString()
  code: string;

  @ApiProperty({ description: "Plan name", example: "Pro" })
  @IsString()
  name: string;

  @ApiProperty({ description: "Plan type", enum: PlanType })
  @IsEnum(PlanType)
  type: PlanType;

  @ApiProperty({ description: "Price in cents", example: 1999, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceCents: number;

  @ApiPropertyOptional({
    description:
      "Short plan description for the UI card (e.g. '50 translations per day · 500 words in dictionary').",
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description:
      "Free trial duration in days. 0 = trial not available.",
    example: 0,
    minimum: 0,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  trialDays?: number;

  @ApiPropertyOptional({ description: "Currency ISO code", example: "USD" })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    description: "Billing interval (e.g. month/year). Null for lifetime/free.",
    example: "month",
  })
  @IsOptional()
  @IsString()
  interval?: string | null;

  @ApiPropertyOptional({
    description: "Whether plan is active and visible",
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      "Grouping code to link monthly/yearly variants of the same plan (e.g. 'PRO').",
    example: "PRO",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  groupCode?: string;

  @ApiPropertyOptional({
    description: "HEX accent color for the plan card (e.g. '#2254d3').",
    example: "#2254d3",
  })
  @IsOptional()
  @IsHexColor()
  displayColor?: string;

  @ApiPropertyOptional({
    description:
      "Icon key in the design system (e.g. 'rocket'). Alphanumeric characters, hyphen and underscore only.",
    example: "rocket",
  })
  @IsOptional()
  @IsString()
  @MaxLength(48)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: "iconKey may only contain letters, digits, hyphen and underscore",
  })
  iconKey?: string;

  @ApiPropertyOptional({
    description:
      "List of 2–4 short feature highlights for the plan card in UI (e.g. ['∞ translations', '10 000 words']).",
    example: ["∞ translations", "10 000 words", "Repetitions + decks"],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  highlightFeatures?: string[];

  @ApiPropertyOptional({
    description: "Plan feature flags",
    type: () => PlanLimits,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanLimits)
  limits?: PlanLimits;
}

