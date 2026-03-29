import { ApiPropertyOptional } from "@nestjs/swagger";
import { PaymentProvider, PaymentStatus } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class FetchPaymentsDto {
  @ApiPropertyOptional({ description: "Filter by status", enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ description: "Filter by provider", enum: PaymentProvider })
  @IsOptional()
  @IsEnum(PaymentProvider)
  provider?: PaymentProvider;

  @ApiPropertyOptional({ description: "Filter by plan id" })
  @IsOptional()
  @IsString()
  planId?: string;

  @ApiPropertyOptional({ description: "Search by provider payment id, user name or email" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: "From date (ISO date-time)", example: "2025-04-01T00:00:00.000Z" })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: "To date (ISO date-time)", example: "2025-04-30T23:59:59.999Z" })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

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
