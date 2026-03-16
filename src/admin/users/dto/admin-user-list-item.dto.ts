import { ApiProperty } from "@nestjs/swagger";
import { Language, Level, UserRole, UserStatus } from "@prisma/client";
import {
  IsDate,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
} from "class-validator";

export class AdminUserListItemDto {
  @ApiProperty({ description: "User ID" })
  @IsString()
  id: string;

  @ApiProperty({ description: "User email" })
  @IsEmail()
  email: string;

  @ApiProperty({ description: "Username" })
  @IsString()
  username: string;

  @ApiProperty({ description: "First name" })
  @IsString()
  name: string;

  @ApiProperty({ description: "Last name" })
  @IsString()
  surname: string;

  @ApiProperty({ description: "Primary user role" })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiProperty({ description: "User status" })
  @IsEnum(UserStatus)
  status: UserStatus;

  @ApiProperty({
    description: "Interface / learning language",
    enum: Language,
    nullable: true,
  })
  @IsEnum(Language)
  @IsOptional()
  language: Language | null;

  @ApiProperty({
    description: "User language level",
    enum: Level,
    nullable: true,
  })
  @IsEnum(Level)
  @IsOptional()
  level: Level | null;

  @ApiProperty({
    description: "User creation date (signup)",
    type: String,
    format: "date-time",
  })
  @IsDate()
  createdAt: Date;

  @ApiProperty({
    description: "Last activity date",
    type: String,
    format: "date-time",
    nullable: true,
  })
  @IsDate()
  @IsOptional()
  lastActiveAt: Date | null;

  @ApiProperty({
    description: "Total number of texts with any progress for this user",
  })
  @IsInt()
  @IsOptional()
  textsRead?: number;

  @ApiProperty({
    description: "Total number of words marked as KNOWN for this user",
  })
  @IsInt()
  @IsOptional()
  wordsKnown?: number;

  @ApiProperty({
    description:
      "Subscriptions info placeholder (to be replaced with real subscriptions model later)",
    nullable: true,
  })
  @IsOptional()
  subscriptions?: unknown | null;
}
