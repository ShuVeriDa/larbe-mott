import { ApiProperty } from "@nestjs/swagger";
import { Level } from "@prisma/client";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

export enum TextStatusFilter {
  ALL = "all",
  PUBLISHED = "published",
  DRAFT = "draft",
  ARCHIVED = "archived",
  PROCESSING = "processing",
  ERROR = "error",
}

export enum TextSortBy {
  CREATED_AT = "createdAt",
  TITLE = "title",
  LEVEL = "level",
  READ_COUNT = "readCount",
}

export enum SortOrder {
  ASC = "asc",
  DESC = "desc",
}

export class AdminListTextsQueryDto {
  @ApiProperty({ required: false, description: "Search by title (case-insensitive)" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, enum: Level, description: "Filter by CEFR level" })
  @IsOptional()
  @Matches(
    `^${Object.values(Level)
      .filter((v) => typeof v !== "number")
      .join("|")}$`,
    "i",
  )
  level?: Level;

  @ApiProperty({ required: false, description: "Filter by tag UUID" })
  @IsOptional()
  @IsUUID("4")
  tagId?: string;

  @ApiProperty({ required: false, enum: TextStatusFilter, default: TextStatusFilter.ALL })
  @IsOptional()
  @IsEnum(TextStatusFilter)
  status?: TextStatusFilter;

  @ApiProperty({ required: false, enum: TextSortBy, default: TextSortBy.CREATED_AT })
  @IsOptional()
  @IsEnum(TextSortBy)
  sortBy?: TextSortBy;

  @ApiProperty({ required: false, enum: SortOrder, default: SortOrder.DESC })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder;

  @ApiProperty({ required: false, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({ required: false, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
