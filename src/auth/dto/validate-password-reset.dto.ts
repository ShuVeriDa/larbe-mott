import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

export class ValidatePasswordResetDto {
  @ApiProperty({ description: "Raw reset token from the link in the email" })
  @IsString()
  @Length(20, 200)
  token: string;
}
