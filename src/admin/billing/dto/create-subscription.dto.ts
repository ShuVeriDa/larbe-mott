import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PaymentProvider, SubscriptionStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Min } from "class-validator";

export class CreateSubscriptionDto {
  @ApiProperty({ description: "Plan ID (UUID)", example: "550e8400-e29b-41d4-a716-446655440000" })
  @IsString()
  planId: string;

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
}

