import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Min } from "class-validator";

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
}

