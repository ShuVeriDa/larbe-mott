import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  PaymentProvider,
  PaymentStatus,
  PlanType,
  SubscriptionStatus,
} from "@prisma/client";
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
} from "class-validator";

export class UserSubscriptionCurrentDto {
  @ApiProperty({ description: "Subscription ID" })
  @IsString()
  id: string;

  @ApiProperty({ description: "Plan type", enum: PlanType })
  @IsEnum(PlanType)
  planType: PlanType;

  @ApiProperty({ description: "Plan display name" })
  @IsString()
  planName: string;

  @ApiProperty({ description: "Subscription status", enum: SubscriptionStatus })
  @IsEnum(SubscriptionStatus)
  status: SubscriptionStatus;

  @ApiProperty({ description: "Subscription start date", type: String, format: "date-time" })
  @IsDate()
  startDate: Date;

  @ApiPropertyOptional({ description: "Subscription end date", type: String, format: "date-time", nullable: true })
  @IsDate()
  @IsOptional()
  endDate: Date | null;

  @ApiPropertyOptional({ description: "Cancellation date", type: String, format: "date-time", nullable: true })
  @IsDate()
  @IsOptional()
  canceledAt: Date | null;

  @ApiProperty({ description: "Whether this is a lifetime subscription" })
  @IsBoolean()
  isLifetime: boolean;

  @ApiProperty({ description: "Plan price in cents" })
  @IsInt()
  priceCents: number;

  @ApiProperty({ description: "Currency code (e.g. USD, RUB)" })
  @IsString()
  currency: string;

  @ApiPropertyOptional({ description: "Billing interval: month | year | null", nullable: true })
  @IsString()
  @IsOptional()
  interval: string | null;

  @ApiProperty({ description: "Payment provider", enum: PaymentProvider })
  @IsEnum(PaymentProvider)
  provider: PaymentProvider;
}

export class UserPaymentHistoryItemDto {
  @ApiProperty({ description: "Payment ID" })
  @IsString()
  id: string;

  @ApiProperty({ description: "Payment status", enum: PaymentStatus })
  @IsEnum(PaymentStatus)
  status: PaymentStatus;

  @ApiProperty({ description: "Charged amount in cents" })
  @IsInt()
  amountCents: number;

  @ApiProperty({ description: "Refunded amount in cents" })
  @IsInt()
  refundedCents: number;

  @ApiProperty({ description: "Currency code" })
  @IsString()
  currency: string;

  @ApiProperty({ description: "Payment date", type: String, format: "date-time" })
  @IsDate()
  createdAt: Date;

  @ApiPropertyOptional({ description: "Plan type at time of payment", enum: PlanType, nullable: true })
  @IsEnum(PlanType)
  @IsOptional()
  planType: PlanType | null;

  @ApiPropertyOptional({ description: "Plan name at time of payment", nullable: true })
  @IsString()
  @IsOptional()
  planName: string | null;
}

export class UserSubscriptionResponseDto {
  @ApiPropertyOptional({
    description: "Current active subscription, null if none",
    type: UserSubscriptionCurrentDto,
    nullable: true,
  })
  current: UserSubscriptionCurrentDto | null;

  @ApiProperty({ description: "Last 20 payments", type: [UserPaymentHistoryItemDto] })
  paymentHistory: UserPaymentHistoryItemDto[];
}
