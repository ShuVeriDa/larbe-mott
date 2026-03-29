import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, Min } from "class-validator";

export class ExtendSubscriptionDto {
  @ApiProperty({ description: "Number of days to add to endDate", minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  days: number;
}
