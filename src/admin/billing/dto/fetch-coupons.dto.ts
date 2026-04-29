import { ApiPropertyOptional } from "@nestjs/swagger";
import { CouponType } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export type CouponStatusFilter =
  | "active"
  | "expired"
  | "exhausted"
  | "disabled";

export type CouponSortField =
  | "createdAt"
  | "redeemedCount"
  | "validUntil"
  | "code";

export class FetchCouponsDto {
  @ApiPropertyOptional({ description: "Filter by coupon type", enum: CouponType })
  @IsOptional()
  @IsEnum(CouponType)
  type?: CouponType;

  @ApiPropertyOptional({
    description: "Filter by computed status",
    enum: ["active", "expired", "exhausted", "disabled"],
  })
  @IsOptional()
  @IsIn(["active", "expired", "exhausted", "disabled"])
  status?: CouponStatusFilter;

  @ApiPropertyOptional({
    description:
      "Filter by applicable plan code (e.g. PRO). Case-insensitive; 'all' is ignored.",
  })
  @IsOptional()
  @IsString()
  plan?: string;

  @ApiPropertyOptional({ description: "Search by code or name" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: "Sort field",
    enum: ["createdAt", "redeemedCount", "validUntil", "code"],
    default: "createdAt",
  })
  @IsOptional()
  @IsIn(["createdAt", "redeemedCount", "validUntil", "code"])
  sortBy?: CouponSortField = "createdAt";

  @ApiPropertyOptional({
    description: "Sort order",
    enum: ["asc", "desc"],
    default: "desc",
  })
  @IsOptional()
  @IsIn(["asc", "desc"])
  sortOrder?: "asc" | "desc" = "desc";

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
