import { ApiProperty } from "@nestjs/swagger";
import {
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsStrongPassword,
  MaxLength,
  MinLength,
} from "class-validator";

export class UpdateUserDto {
  @ApiProperty()
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsStrongPassword({
    minLength: 6,
    minUppercase: 1,
    minSymbols: 1,
  })
  @IsOptional()
  password?: string;

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
}
