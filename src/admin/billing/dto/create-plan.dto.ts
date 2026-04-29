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
      "Короткое описание плана для UI-карточки (например, '50 переводов в день · 500 слов в словаре').",
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description:
      "Длительность бесплатного триала в днях. 0 = триал недоступен.",
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
      "Группирующий код для связки monthly/yearly вариантов одного тарифа (например, 'PRO').",
    example: "PRO",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  groupCode?: string;

  @ApiPropertyOptional({
    description: "HEX-цвет акцента карточки тарифа (например, '#2254d3').",
    example: "#2254d3",
  })
  @IsOptional()
  @IsHexColor()
  displayColor?: string;

  @ApiPropertyOptional({
    description:
      "Ключ иконки в дизайн-системе (например, 'rocket'). Алфавитно-цифровые символы, дефис и подчёркивание.",
    example: "rocket",
  })
  @IsOptional()
  @IsString()
  @MaxLength(48)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: "iconKey может содержать только буквы, цифры, дефис и подчёркивание",
  })
  iconKey?: string;

  @ApiPropertyOptional({
    description:
      "Список из 2–4 коротких фич для карточки тарифа в UI (например, ['∞ переводов', '10 000 слов']).",
    example: ["∞ переводов", "10 000 слов", "Повторения + деки"],
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

