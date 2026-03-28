import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength, MaxLength } from "class-validator";

export class RedeemPromoDto {
  @ApiProperty({ description: "Promo code to redeem", example: "PROMO2024" })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code: string;
}
