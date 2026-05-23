import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class ChangePasswordDto {
  @ApiProperty({ description: "Current password" })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword: string;

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
  newPassword: string;

  @ApiPropertyOptional({
    description: "UI language in which to send the notification email",
    enum: ["ru", "che", "en", "ar"],
    default: "ru",
  })
  @IsOptional()
  @IsIn(["ru", "che", "en", "ar"])
  lang?: "ru" | "che" | "en" | "ar";
}
