import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Language, Level, UserStatus } from "@prisma/client";
import { IsDate, IsEmail, IsEnum, IsOptional, IsString } from "class-validator";
import { UserRoleItemDto } from "./user-role-item.dto";
import { UserSubscriptionCurrentDto } from "./user-subscription-response.dto";
import { UserLearningStatsDto } from "./user-learning-stats.dto";

export class AdminUserDetailsDto {
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

  @ApiPropertyOptional({ description: "Phone number", nullable: true })
  @IsString()
  @IsOptional()
  phone: string | null;

  @ApiProperty({ description: "User status", enum: UserStatus })
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
    description: "Registration date (signupAt)",
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

  @ApiProperty({
    description: "Assigned RBAC roles with assignment date",
    type: [UserRoleItemDto],
  })
  roles: UserRoleItemDto[];

  @ApiPropertyOptional({
    description: "Current active subscription, null if none",
    type: UserSubscriptionCurrentDto,
    nullable: true,
  })
  subscription: UserSubscriptionCurrentDto | null;

  @ApiProperty({
    description: "Aggregated learning statistics for this user",
    type: UserLearningStatsDto,
  })
  learningStats: UserLearningStatsDto;
}
