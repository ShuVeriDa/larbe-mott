import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class ApplyCouponDto {
  @ApiProperty({ description: "Coupon code to apply to the user" })
  @IsString()
  code: string;
}
