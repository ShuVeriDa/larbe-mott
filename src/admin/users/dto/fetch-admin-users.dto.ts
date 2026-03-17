import { ApiPropertyOptional } from "@nestjs/swagger";
import { Language, Level, RoleName, UserStatus } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from "class-validator";

export class FetchAdminUsersDto {
  @ApiPropertyOptional({
    description:
      "Free text search across email, username, name and surname (case-insensitive)",
    example: "john",
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: "Exact user email",
    example: "john.doe@example.com",
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({
    description: "Exact username",
    example: "johndoe",
  })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({
    description: "User ID (UUID)",
    example: "b4a2c5e4-5f1b-4d5e-9b6c-7a8f9e0d1c2b",
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional({
    description: "Filter by interface / learning language",
    enum: Language,
  })
  @IsOptional()
  @IsEnum(Language)
  language?: Language;

  @ApiPropertyOptional({
    description: "Filter by user language level",
    enum: Level,
  })
  @IsOptional()
  @IsEnum(Level)
  level?: Level;

  @ApiPropertyOptional({
    description: "Filter by user status",
    enum: UserStatus,
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({
    description: "Filter by RBAC role (RoleName)",
    enum: RoleName,
  })
  @IsOptional()
  @IsEnum(RoleName)
  role?: RoleName;

  @ApiPropertyOptional({
    description: "Page number (1-based)",
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: "Items per page (1–100)",
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
