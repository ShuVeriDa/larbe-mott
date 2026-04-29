import { ApiPropertyOptional } from "@nestjs/swagger";
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

export class UpdatePlanDto {
  @ApiPropertyOptional({ description: "Plan name", example: "Pro" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: "Plan type", enum: PlanType })
  @IsOptional()
  @IsEnum(PlanType)
  type?: PlanType;

  @ApiPropertyOptional({ description: "Price in cents", example: 1999, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceCents?: number;

  @ApiPropertyOptional({
    description:
      "Короткое описание плана для UI-карточки. Передайте null чтобы очистить.",
    nullable: true,
  })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({
    description: "Длительность бесплатного триала в днях. 0 = триал недоступен.",
    example: 0,
    minimum: 0,
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

  @ApiPropertyOptional({ description: "Whether plan is active", example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      "Группирующий код для связки monthly/yearly вариантов одного тарифа. Передайте null чтобы разорвать связку.",
    nullable: true,
    example: "PRO",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  groupCode?: string | null;

  @ApiPropertyOptional({
    description: "HEX-цвет акцента карточки тарифа. Передайте null чтобы сбросить.",
    nullable: true,
    example: "#2254d3",
  })
  @IsOptional()
  @IsHexColor()
  displayColor?: string | null;

  @ApiPropertyOptional({
    description: "Ключ иконки в дизайн-системе. Передайте null чтобы сбросить.",
    nullable: true,
    example: "rocket",
  })
  @IsOptional()
  @IsString()
  @MaxLength(48)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: "iconKey может содержать только буквы, цифры, дефис и подчёркивание",
  })
  iconKey?: string | null;

  @ApiPropertyOptional({
    description:
      "Список из 2–4 коротких фич для карточки тарифа в UI. Передайте [] чтобы очистить.",
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

