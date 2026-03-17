import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
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

export class CreateCouponDto {
  @ApiProperty({ description: "Coupon code", example: "WELCOME50" })
  @IsString()
  code: string;

  @ApiProperty({ description: "Coupon type", enum: CouponType })
  @IsEnum(CouponType)
  type: CouponType;

  @ApiProperty({
    description: "Discount value (percent for PERCENT, cents for FIXED)",
    example: 50,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount: number;

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
  validFrom?: string;

  @ApiPropertyOptional({ description: "Valid until (ISO date-time)", example: "2026-12-31T23:59:59.999Z" })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiPropertyOptional({ description: "Whether coupon is active", default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

