import { ApiPropertyOptional } from "@nestjs/swagger";
import { Level, WordStatus } from "@prisma/client";
import { IsBoolean, IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";
import { Transform } from "class-transformer";

export enum DictionarySort {
  ADDED = "added",
  ALPHA = "alpha",
  REVIEW = "review",
  STATUS = "status",
}

export class GetDictionaryEntriesDto {
  @ApiPropertyOptional({
    description: "Filter by learning status",
    enum: WordStatus,
  })
  @IsOptional()
  @IsEnum(WordStatus)
  status?: WordStatus;

  @ApiPropertyOptional({
    description: "Filter by CEFR level",
    enum: Level,
  })
  @IsOptional()
  @IsEnum(Level)
  cefrLevel?: Level;

  @ApiPropertyOptional({
    description: "Filter by folder ID",
  })
  @IsOptional()
  @IsUUID()
  folderId?: string;

  @ApiPropertyOptional({
    description: "If true, return only words without a folder (folderId = null). Takes priority over folderId.",
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  noFolder?: boolean;

  @ApiPropertyOptional({
    description: "Sort order: added (date added desc), alpha (alphabetical), review (next review date asc), status (NEW → LEARNING → KNOWN)",
    enum: DictionarySort,
    default: DictionarySort.ADDED,
  })
  @IsOptional()
  @IsEnum(DictionarySort)
  sort?: DictionarySort;

  @ApiPropertyOptional({
    description: "Page number (default 1)",
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Transform(({ value }) => Number.parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: "Items per page (default 20, max 50)",
    minimum: 1,
    maximum: 50,
    default: 20,
  })
  @IsOptional()
  @Transform(({ value }) => Number.parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
