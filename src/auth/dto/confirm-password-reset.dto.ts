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
    description: "Raw reset token from the link in the email",
  })
  @IsString()
  @Length(20, 200)
  token: string;

  @ApiProperty({
    description:
      "New password. At least 8 characters, one uppercase letter (latin/cyrillic), one digit or special character.",
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
