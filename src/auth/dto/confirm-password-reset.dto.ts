import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class ConfirmPasswordResetDto {
  @ApiProperty({
    description: "Сырой reset-токен из ссылки в письме",
  })
  @IsString()
  @Length(20, 200)
  token: string;

  @ApiProperty({
    description:
      "Новый пароль. Минимум 8 символов, заглавная буква (latin/cyrillic), цифра или спецсимвол.",
    minLength: 8,
    maxLength: 128,
  })
  @IsString()
  @MinLength(8, { message: "Password must be at least 8 characters" })
  @MaxLength(128)
  @Matches(/[A-ZА-ЯЁ]/, {
    message: "Password must contain an uppercase letter",
  })
  @Matches(/[0-9\W_]/, {
    message: "Password must contain a digit or special character",
  })
  password: string;
}
