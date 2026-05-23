import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsIn, IsOptional } from "class-validator";

export class ForgotPasswordDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    description: "UI language in which to send the email",
    enum: ["ru", "che", "en", "ar"],
    default: "ru",
  })
  @IsOptional()
  @IsIn(["ru", "che", "en", "ar"])
  lang?: "ru" | "che" | "en" | "ar";
}
