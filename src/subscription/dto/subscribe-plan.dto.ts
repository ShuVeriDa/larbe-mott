import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID } from "class-validator";

export class SubscribePlanDto {
  @ApiPropertyOptional({
    description: "Plan ID (UUID). Either planId or planCode must be provided.",
    example: "uuid-of-plan",
  })
  @IsOptional()
  @IsString()
  @IsUUID()
  planId?: string;

  @ApiPropertyOptional({
    description:
      "Plan code (e.g. 'PREMIUM_MONTHLY'). Used as alias for planId — convenient for landing CTA links like /register?plan=premium.",
    example: "PREMIUM_MONTHLY",
  })
  @IsOptional()
  @IsString()
  planCode?: string;
}
