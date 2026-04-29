import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty } from "class-validator";

export class DeleteAccountDto {
  @ApiProperty({
    description:
      "Email текущего пользователя. Должен совпадать с email аккаунта — используется как явное подтверждение операции.",
    example: "user@example.com",
  })
  @IsEmail()
  @IsNotEmpty()
  confirmEmail: string;
}
