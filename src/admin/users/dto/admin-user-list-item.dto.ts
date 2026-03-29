import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Language, Level, PlanType, RoleName, UserStatus } from "@prisma/client";
import {
  IsArray,
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

  @ApiProperty({ description: "User status", enum: UserStatus })
  @IsEnum(UserStatus)
  status: UserStatus;

  @ApiProperty({
    description: "Assigned RBAC roles",
    type: [String],
    enum: RoleName,
    example: ["LEARNER", "CONTENT"],
  })
  @IsArray()
  roles: RoleName[];

  @ApiPropertyOptional({
    description: "Active subscription plan type. null means FREE (no active subscription).",
    enum: PlanType,
    nullable: true,
  })
  plan: PlanType | null;

  @ApiPropertyOptional({
    description: "Interface / learning language",
    enum: Language,
    nullable: true,
  })
  @IsEnum(Language)
  @IsOptional()
  language: Language | null;

  @ApiPropertyOptional({
    description: "User language level",
    enum: Level,
    nullable: true,
  })
  @IsEnum(Level)
  @IsOptional()
  level: Level | null;

  @ApiProperty({
    description: "Registration date",
    type: String,
    format: "date-time",
  })
  @IsDate()
  signupAt: Date;

  @ApiProperty({
    description: "Last activity date",
    type: String,
    format: "date-time",
    nullable: true,
  })
  @IsDate()
  @IsOptional()
  lastActiveAt: Date | null;

  @ApiPropertyOptional({ description: "Texts with any reading progress" })
  @IsInt()
  @IsOptional()
  textsRead?: number;

  @ApiPropertyOptional({ description: "Words marked as KNOWN" })
  @IsInt()
  @IsOptional()
  wordsKnown?: number;
}
