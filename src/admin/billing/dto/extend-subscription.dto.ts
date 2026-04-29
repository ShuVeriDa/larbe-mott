import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class ExtendSubscriptionDto {
  @ApiProperty({ description: "Extend subscription by N days", example: 30, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  extendDays: number;

  @ApiPropertyOptional({
    description: "Optional admin comment, stored in SubscriptionEvent.metadata.reason",
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
