import { ApiPropertyOptional } from "@nestjs/swagger";
import { PaymentProvider, SubscriptionStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class CreateSubscriptionDto {
  @ApiPropertyOptional({ description: "Plan ID (UUID). Required if planCode is not provided.", example: "550e8400-e29b-41d4-a716-446655440000" })
  @IsOptional()
  @IsString()
  planId?: string;

  @ApiPropertyOptional({
    description: "Plan code (alternative to planId). E.g. PREMIUM.",
    example: "PREMIUM",
  })
  @IsOptional()
  @IsString()
  planCode?: string;

  @ApiPropertyOptional({
    description: "Subscription status. Defaults to ACTIVE unless trial/lifetime is used.",
    enum: SubscriptionStatus,
  })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @ApiPropertyOptional({
    description: "Trial duration in days. If provided, status becomes TRIALING and endDate is set.",
    example: 7,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  trialDays?: number;

  @ApiPropertyOptional({
    description: "Custom subscription duration in days (used when no trial / no lifetime). Sets endDate = now + durationDays.",
    example: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationDays?: number;

  @ApiPropertyOptional({
    description: "If true, creates a lifetime subscription (endDate = null, isLifetime = true).",
    example: false,
  })
  @IsOptional()
  isLifetime?: boolean;

  @ApiPropertyOptional({
    description: "Payment provider (MANUAL by default for admin actions).",
    enum: PaymentProvider,
    example: PaymentProvider.MANUAL,
  })
  @IsOptional()
  @IsEnum(PaymentProvider)
  provider?: PaymentProvider;

  @ApiPropertyOptional({
    description: "Optional admin comment, stored in SubscriptionEvent.metadata.reason",
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
