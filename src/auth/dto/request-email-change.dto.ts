import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class RequestEmailChangeDto {
  @ApiProperty({
    description: "Новый email-адрес. Письмо со ссылкой будет отправлено на него.",
    example: "new@example.com",
  })
  @IsEmail()
  @MaxLength(254)
  newEmail: string;

  @ApiProperty({
    description:
      "Текущий пароль (доказательство владения аккаунтом — на случай угона активной сессии).",
  })
  @IsString()
  @MaxLength(128)
  currentPassword: string;

  @ApiPropertyOptional({
    description: "UI-язык, на котором отправлять письма подтверждения и уведомления",
    enum: ["ru", "che", "en", "ar"],
    default: "ru",
  })
  @IsOptional()
  @IsIn(["ru", "che", "en", "ar"])
  lang?: "ru" | "che" | "en" | "ar";
}
