import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Language, Level } from "@prisma/client";
import {
  IsEnum,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

// ВНИМАНИЕ: email и password сюда НЕ входят сознательно.
// — email меняется через POST /auth/email-change/request → /confirm (требует владения новым ящиком).
// — password меняется через POST /auth/password/change (требует current).
// Это было исправлено в рамках аудита /profile: PATCH /users без верификации
// открывал тривиальный угон аккаунта при компрометации access-токена.
export class UpdateUserDto {
  @ApiProperty()
  @IsString()
  @MinLength(2, {
    message: "Username must be at least 2 characters long",
  })
  @MaxLength(16, {
    message: "Username must be no more than 16 characters long",
  })
  @IsOptional()
  username?: string;

  @ApiProperty()
  @IsString()
  @MinLength(2, {
    message: "Name must be at least 2 characters long",
  })
  @MaxLength(32, {
    message: "Name must be no more than 32 characters long",
  })
  @IsOptional()
  name?: string;

  @ApiProperty()
  @IsString()
  @MinLength(2, {
    message: "Surname must be at least 2 characters long",
  })
  @MaxLength(32, {
    message: "Surname must be no more than 32 characters long",
  })
  @IsOptional()
  surname?: string;

  @ApiProperty()
  @IsPhoneNumber()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({
    description:
      "URL аватара пользователя. Передайте пустую строку, чтобы сбросить аватар (показ инициалов).",
    example: "https://cdn.example.com/avatars/u123.png",
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== "" && value !== null)
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  avatar?: string | null;

  @ApiPropertyOptional({ enum: Language, description: "Язык, который изучает пользователь" })
  @IsOptional()
  @IsEnum(Language)
  language?: Language;

  @ApiPropertyOptional({ enum: Level, description: "Уровень владения языком (CEFR)" })
  @IsOptional()
  @IsEnum(Level)
  level?: Level;
}
