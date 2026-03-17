import { ApiPropertyOptional } from "@nestjs/swagger";
import { CouponType } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class UpdateCouponDto {
  @ApiPropertyOptional({ description: "Coupon code", example: "WELCOME50" })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ description: "Coupon type", enum: CouponType })
  @IsOptional()
  @IsEnum(CouponType)
  type?: CouponType;

  @ApiPropertyOptional({
    description: "Discount value (percent for PERCENT, cents for FIXED)",
    example: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount?: number;

  @ApiPropertyOptional({
    description: "Maximum number of redemptions (null = unlimited)",
    example: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxRedemptions?: number | null;

  @ApiPropertyOptional({ description: "Valid from (ISO date-time)", example: "2026-03-17T00:00:00.000Z" })
  @IsOptional()
  @IsDateString()
  validFrom?: string | null;

  @ApiPropertyOptional({ description: "Valid until (ISO date-time)", example: "2026-12-31T23:59:59.999Z" })
  @IsOptional()
  @IsDateString()
  validUntil?: string | null;

  @ApiPropertyOptional({ description: "Whether coupon is active", example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

