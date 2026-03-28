import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsUUID } from "class-validator";

export class SubscribePlanDto {
  @ApiProperty({ description: "Plan ID to subscribe to", example: "uuid-of-plan" })
  @IsString()
  @IsUUID()
  planId: string;
}
