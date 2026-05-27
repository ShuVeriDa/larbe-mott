import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";

export class LoginDto {
  @ApiProperty({ description: "Username or email" })
  @IsString()
  username: string;

  @ApiProperty()
  @MinLength(6, {
    message: "Password must be at least 6 characters long",
  })
  @IsString()
  password: string;

  @ApiPropertyOptional({ description: "Keep session alive for 30 days" })
  @IsBoolean()
  @IsOptional()
  rememberMe?: boolean;
}
