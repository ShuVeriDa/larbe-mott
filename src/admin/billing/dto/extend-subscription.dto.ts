import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, Min } from "class-validator";

export class ExtendSubscriptionDto {
  @ApiProperty({ description: "Extend subscription by N days", example: 30, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  extendDays: number;
}

