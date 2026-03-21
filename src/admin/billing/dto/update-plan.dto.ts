import { ApiPropertyOptional } from "@nestjs/swagger";
import { PlanType } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
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
    description: "Plan feature flags",
    type: () => PlanLimits,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanLimits)
  limits?: PlanLimits;
}

