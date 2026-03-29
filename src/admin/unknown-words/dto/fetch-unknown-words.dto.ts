import { ApiPropertyOptional } from "@nestjs/swagger";
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

export enum UnknownWordsSortOrder {
  FREQUENCY_DESC = "frequency_desc",
  NEWEST_FIRST = "newest_first",
  ALPHABETICAL = "alphabetical",
}

export enum UnknownWordsTab {
  ALL = "all",
  FREQUENT = "frequent",
  RARE = "rare",
}

export class FetchUnknownWordsDto {
  @ApiPropertyOptional({
    description: "Search by word or normalized form (case-insensitive)",
    example: "дош",
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: "Filter by source text ID",
    example: "550e8400-e29b-41d4-a716-446655440000",
  })
  @IsOptional()
  @IsUUID()
  textId?: string;

  @ApiPropertyOptional({
    description: "Sort order",
    enum: UnknownWordsSortOrder,
    default: UnknownWordsSortOrder.FREQUENCY_DESC,
  })
  @IsOptional()
  @IsEnum(UnknownWordsSortOrder)
  sort?: UnknownWordsSortOrder = UnknownWordsSortOrder.FREQUENCY_DESC;

  @ApiPropertyOptional({
    description:
      "Tab filter: all — все, frequent — seenCount ≥ 5, rare — seenCount < 5",
    enum: UnknownWordsTab,
    default: UnknownWordsTab.ALL,
  })
  @IsOptional()
  @IsEnum(UnknownWordsTab)
  tab?: UnknownWordsTab = UnknownWordsTab.ALL;

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
