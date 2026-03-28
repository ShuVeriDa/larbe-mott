import { ApiPropertyOptional } from "@nestjs/swagger";
import { Level, WordStatus } from "@prisma/client";
import { IsBoolean, IsEnum, IsOptional, IsUUID } from "class-validator";
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
}
