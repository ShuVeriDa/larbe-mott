import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class CancelSubscriptionDto {
  @ApiPropertyOptional({
    description: "Optional admin comment, stored in SubscriptionEvent.metadata.reason",
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
