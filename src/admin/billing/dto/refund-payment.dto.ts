import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export enum RefundReason {
  USER_REQUEST = "user_request",
  DUPLICATE = "duplicate",
  CHARGE_ERROR = "charge_error",
  OTHER = "other",
}

export class RefundPaymentDto {
  @ApiPropertyOptional({
    description:
      "Refund amount in cents. If omitted, will refund full remaining amount.",
    example: 1999,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountCents?: number;

  @ApiPropertyOptional({
    description: "Refund reason category",
    enum: RefundReason,
    example: RefundReason.USER_REQUEST,
  })
  @IsOptional()
  @IsEnum(RefundReason)
  reason?: RefundReason;

  @ApiPropertyOptional({
    description: "Free-form note (typically required when reason is OTHER)",
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reasonNote?: string;
}
