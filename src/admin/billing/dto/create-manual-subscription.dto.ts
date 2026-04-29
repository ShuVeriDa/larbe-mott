import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString } from "class-validator";
import { CreateSubscriptionDto } from "./create-subscription.dto";

export class CreateManualSubscriptionDto extends CreateSubscriptionDto {
  @ApiPropertyOptional({ description: "User ID. Either userId or email must be provided." })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: "User email. Either userId or email must be provided." })
  @IsOptional()
  @IsEmail()
  email?: string;
}
