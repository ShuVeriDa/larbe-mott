import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Language, Level } from "@prisma/client";

export type DictSortOption = "alpha" | "frequency_desc" | "newest" | "no_senses";
export type DictTabOption = "all" | "no_senses" | "no_examples" | "no_forms";

/** Query params for GET /admin/dictionary — search, filters, sort, tabs, pagination. */
export class DictionaryListQueryDto {
  @ApiPropertyOptional({
    description: "Search by normalized form or base form (case-insensitive)",
    example: "машин",
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: Language, description: "Filter by language" })
  @IsOptional()
  @IsEnum(Language)
  language?: Language;

  @ApiPropertyOptional({
    description: "Filter by part of speech",
    example: "noun",
  })
  @IsOptional()
  @IsString()
  pos?: string;

  @ApiPropertyOptional({ enum: Level, description: "Filter by CEFR level" })
  @IsOptional()
  @IsEnum(Level)
  level?: Level;

  @ApiPropertyOptional({
    description: "Sort order: alpha | frequency_desc | newest | no_senses",
    enum: ["alpha", "frequency_desc", "newest", "no_senses"],
    default: "alpha",
  })
  @IsOptional()
  @IsString()
  sort?: DictSortOption = "alpha";

  @ApiPropertyOptional({
    description: "Filter tab: all | no_senses | no_examples | no_forms",
    enum: ["all", "no_senses", "no_examples", "no_forms"],
    default: "all",
  })
  @IsOptional()
  @IsString()
  tab?: DictTabOption = "all";

  @ApiPropertyOptional({ description: "Page number (1-based)", default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: "Items per page (1–100)", default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
