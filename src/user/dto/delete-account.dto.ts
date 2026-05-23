import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty } from "class-validator";

export class DeleteAccountDto {
  @ApiProperty({
    description:
      "Email of the current user. Must match the account email — used as an explicit confirmation of the operation.",
    example: "user@example.com",
  })
  @IsEmail()
  @IsNotEmpty()
  confirmEmail: string;
}
