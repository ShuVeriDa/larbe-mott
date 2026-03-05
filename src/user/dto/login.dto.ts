import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class LoginDto {
  @ApiProperty()
  @IsString()
  username: string;

  @ApiProperty()
  @MinLength(6, {
    message: "Password must be at least 6 characters long",
  })
  @IsString()
  password: string;
}
