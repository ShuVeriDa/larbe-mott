import { ApiPropertyOptional } from "@nestjs/swagger";
import { PaymentProvider, PlanType, SubscriptionStatus } from "@prisma/client";
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

export const SUBSCRIPTIONS_SORT_VALUES = [
  "nextBilling_asc",
  "nextBilling_desc",
  "amount_asc",
  "amount_desc",
  "createdAt_asc",
  "createdAt_desc",
] as const;

export type SubscriptionsSort = (typeof SUBSCRIPTIONS_SORT_VALUES)[number];

export class FetchSubscriptionsDto {
  @ApiPropertyOptional({ description: "Filter by status", enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @ApiPropertyOptional({ description: "Filter by payment provider", enum: PaymentProvider })
  @IsOptional()
  @IsEnum(PaymentProvider)
  provider?: PaymentProvider;

  @ApiPropertyOptional({ description: "Filter by plan id (UUID)" })
  @IsOptional()
  @IsString()
  planId?: string;

  @ApiPropertyOptional({
    description: "Filter by plan type (FREE/BASIC/PRO/PREMIUM/LIFETIME)",
    enum: PlanType,
  })
  @IsOptional()
  @IsEnum(PlanType)
  planType?: PlanType;

  @ApiPropertyOptional({ description: "Filter by plan code (case-insensitive)" })
  @IsOptional()
  @IsString()
  planCode?: string;

  @ApiPropertyOptional({ description: "Filter by user id" })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: "Search by user name, email or user id" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: "Sort order",
    enum: SUBSCRIPTIONS_SORT_VALUES,
    default: "nextBilling_asc",
  })
  @IsOptional()
  @IsIn(SUBSCRIPTIONS_SORT_VALUES as unknown as string[])
  sort?: SubscriptionsSort;

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

  @ApiPropertyOptional({ description: "Export format. Use 'csv' for CSV file download.", enum: ["json", "csv"] })
  @IsOptional()
  @IsIn(["json", "csv"])
  format?: "json" | "csv";
}
