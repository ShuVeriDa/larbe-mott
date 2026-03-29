import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import {
  FeedbackPriority,
  FeedbackStatus,
  FeedbackType,
} from "@prisma/client";

export enum AdminFeedbackTab {
  OPEN = "OPEN",
  ALL = "ALL",
  CLOSED = "CLOSED",
}

export class FetchAdminFeedbackDto {
  @ApiPropertyOptional({ enum: FeedbackType })
  @IsOptional()
  @IsEnum(FeedbackType)
  type?: FeedbackType;

  @ApiPropertyOptional({ enum: FeedbackStatus })
  @IsOptional()
  @IsEnum(FeedbackStatus)
  status?: FeedbackStatus;

  @ApiPropertyOptional({ enum: FeedbackPriority })
  @IsOptional()
  @IsEnum(FeedbackPriority)
  priority?: FeedbackPriority;

  @ApiPropertyOptional({ description: "Filter by userId" })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: "Filter by assignee admin id" })
  @IsOptional()
  @IsString()
  assigneeAdminId?: string;

  @ApiPropertyOptional({ enum: AdminFeedbackTab, default: AdminFeedbackTab.ALL })
  @IsOptional()
  @IsEnum(AdminFeedbackTab)
  tab?: AdminFeedbackTab = AdminFeedbackTab.ALL;

  @ApiPropertyOptional({
    description: "Search in ticket number, title, user fields and messages",
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
