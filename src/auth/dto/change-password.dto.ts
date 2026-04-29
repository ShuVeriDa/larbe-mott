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
  @ApiProperty({ description: "Текущий пароль" })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword: string;

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
  newPassword: string;

  @ApiPropertyOptional({
    description: "UI-язык, на котором отправлять уведомительное письмо",
    enum: ["ru", "che", "en", "ar"],
    default: "ru",
  })
  @IsOptional()
  @IsIn(["ru", "che", "en", "ar"])
  lang?: "ru" | "che" | "en" | "ar";
}
