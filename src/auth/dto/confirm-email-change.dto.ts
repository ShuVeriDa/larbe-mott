import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

export class ConfirmEmailChangeDto {
  @ApiProperty({
    description: "Raw email-change confirmation token from the link in the email",
  })
  @IsString()
  @Length(20, 200)
  token: string;
}
