import { ApiPropertyOptional } from "@nestjs/swagger";
import { PaymentProvider, SubscriptionStatus } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class FetchSubscriptionsDto {
  @ApiPropertyOptional({ description: "Filter by status", enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @ApiPropertyOptional({ description: "Filter by payment provider", enum: PaymentProvider })
  @IsOptional()
  @IsEnum(PaymentProvider)
  provider?: PaymentProvider;

  @ApiPropertyOptional({ description: "Filter by plan id" })
  @IsOptional()
  @IsString()
  planId?: string;

  @ApiPropertyOptional({ description: "Filter by user id" })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: "Search by user name, email or user id" })
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
