import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export enum TokenizationTab {
  ALL = "all",
  ISSUES = "issues",
  NOT_FOUND = "notfound",
  PENDING = "pending",
}

export enum TokenizationSortBy {
  ERRORS = "errors",
  DATE = "date",
  NAME = "name",
}

export class AdminTokenizationListQueryDto {
  @ApiPropertyOptional({
    enum: TokenizationTab,
    default: TokenizationTab.ALL,
    description: "all — все тексты; issues — с ошибками; notfound — с NOT_FOUND токенами; pending — без обработки",
  })
  @IsEnum(TokenizationTab)
  @IsOptional()
  tab?: TokenizationTab;

  @ApiPropertyOptional({ description: "Поиск по названию текста" })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: ["A1", "A2", "B1", "B2", "C1", "C2"] })
  @IsEnum(["A1", "A2", "B1", "B2", "C1", "C2"])
  @IsOptional()
  level?: string;

  @ApiPropertyOptional({
    enum: ["ANALYZED", "AMBIGUOUS", "NOT_FOUND"],
    description: "Фильтр по преобладающему статусу токенов",
  })
  @IsEnum(["ANALYZED", "AMBIGUOUS", "NOT_FOUND"])
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ enum: TokenizationSortBy, default: TokenizationSortBy.ERRORS })
  @IsEnum(TokenizationSortBy)
  @IsOptional()
  sort?: TokenizationSortBy;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}
