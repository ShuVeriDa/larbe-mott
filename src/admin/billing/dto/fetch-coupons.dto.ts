import { ApiPropertyOptional } from "@nestjs/swagger";
import { CouponType } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class FetchCouponsDto {
  @ApiPropertyOptional({ description: "Filter by coupon type", enum: CouponType })
  @IsOptional()
  @IsEnum(CouponType)
  type?: CouponType;

  @ApiPropertyOptional({
    description: "Filter by computed status: active | expired | exhausted",
    enum: ["active", "expired", "exhausted"],
  })
  @IsOptional()
  @IsString()
  status?: "active" | "expired" | "exhausted";

  @ApiPropertyOptional({ description: "Filter by applicable plan code (e.g. PRO)" })
  @IsOptional()
  @IsString()
  plan?: string;

  @ApiPropertyOptional({ description: "Search by code or name" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: "Page number (1-based)", default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: "Items per page (1–100)", default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;
}
