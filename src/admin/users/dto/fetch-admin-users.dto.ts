import { ApiPropertyOptional } from "@nestjs/swagger";
import { Language, Level, PlanType, RoleName, UserStatus } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from "class-validator";

export enum UsersSort {
  SIGNUP_DESC = "signup_desc",
  ACTIVITY_DESC = "activity_desc",
  NAME_ASC = "name_asc",
}

export enum UsersTab {
  ALL = "all",
  ACTIVE = "active",
  BLOCKED = "blocked",
  FROZEN = "frozen",
  DELETED = "deleted",
}

export class FetchAdminUsersDto {
  @ApiPropertyOptional({
    description:
      "Free text search across email, username, name and surname (case-insensitive)",
    example: "john",
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: "Exact user email" })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ description: "Exact username" })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ description: "User ID (UUID)" })
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
    description:
      "Filter by user status. Ignored when tab is provided. Default (no tab, no status): excludes DELETED.",
    enum: UserStatus,
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({
    description: "Filter by RBAC role",
    enum: RoleName,
  })
  @IsOptional()
  @IsEnum(RoleName)
  role?: RoleName;

  @ApiPropertyOptional({
    description:
      "Filter by active subscription plan. FREE matches users with no active paid subscription.",
    enum: PlanType,
  })
  @IsOptional()
  @IsEnum(PlanType)
  plan?: PlanType;

  @ApiPropertyOptional({
    description:
      "Tab filter — overrides status param. 'all' includes DELETED users.",
    enum: UsersTab,
  })
  @IsOptional()
  @IsEnum(UsersTab)
  tab?: UsersTab;

  @ApiPropertyOptional({
    description: "Sort order",
    enum: UsersSort,
    default: UsersSort.SIGNUP_DESC,
  })
  @IsOptional()
  @IsEnum(UsersSort)
  sort?: UsersSort = UsersSort.SIGNUP_DESC;

  @ApiPropertyOptional({
    description: "Export format (used by /export endpoint)",
    enum: ["json", "csv"],
    default: "json",
  })
  @IsOptional()
  @IsIn(["json", "csv"])
  format?: "json" | "csv";

  @ApiPropertyOptional({ description: "Page number (1-based)", default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: "Items per page (1–100)", default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;
}
