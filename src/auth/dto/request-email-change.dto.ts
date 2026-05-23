import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class RequestEmailChangeDto {
  @ApiProperty({
    description: "New email address. A confirmation link will be sent to it.",
    example: "new@example.com",
  })
  @IsEmail()
  @MaxLength(254)
  newEmail: string;

  @ApiProperty({
    description:
      "Current password (proof of account ownership — to prevent hijacking of an active session).",
  })
  @IsString()
  @MaxLength(128)
  currentPassword: string;

  @ApiPropertyOptional({
    description: "UI language in which to send confirmation and notification emails",
    enum: ["ru", "che", "en", "ar"],
    default: "ru",
  })
  @IsOptional()
  @IsIn(["ru", "che", "en", "ar"])
  lang?: "ru" | "che" | "en" | "ar";
}
