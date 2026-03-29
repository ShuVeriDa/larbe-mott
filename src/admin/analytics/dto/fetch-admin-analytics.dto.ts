import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export enum AnalyticsRange {
  LAST_7_DAYS = "7d",
  LAST_30_DAYS = "30d",
  LAST_90_DAYS = "90d",
  ALL = "all",
}

export enum DifficultTextsTab {
  FAIL = "fail",
  UNKNOWN_PERCENT = "pct",
  ABANDON = "abandon",
}

export enum PopularTextsTab {
  OPENS = "opens",
  COMPLETE = "complete",
  SAVED = "saved",
}

export enum AnalyticsExportFormat {
  JSON = "json",
  CSV = "csv",
}

export class FetchAdminAnalyticsDto {
  @ApiPropertyOptional({
    description:
      "Predefined period (ignored when dateFrom + dateTo are passed).",
    enum: AnalyticsRange,
    default: AnalyticsRange.LAST_30_DAYS,
  })
  @IsOptional()
  @IsEnum(AnalyticsRange)
  range?: AnalyticsRange = AnalyticsRange.LAST_30_DAYS;

  @ApiPropertyOptional({
    description: "Custom range start (ISO date-time).",
    example: "2025-05-01T00:00:00.000Z",
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: "Custom range end (ISO date-time).",
    example: "2025-05-31T23:59:59.999Z",
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    description: "IANA timezone for day/hour aggregations.",
    example: "Europe/Moscow",
    default: "UTC",
  })
  @IsOptional()
  @IsString()
  tz?: string = "UTC";

  @ApiPropertyOptional({
    description: "Metric for difficult texts block.",
    enum: DifficultTextsTab,
    default: DifficultTextsTab.FAIL,
  })
  @IsOptional()
  @IsEnum(DifficultTextsTab)
  difficultBy?: DifficultTextsTab = DifficultTextsTab.FAIL;

  @ApiPropertyOptional({
    description: "Metric for popular texts block.",
    enum: PopularTextsTab,
    default: PopularTextsTab.OPENS,
  })
  @IsOptional()
  @IsEnum(PopularTextsTab)
  popularBy?: PopularTextsTab = PopularTextsTab.OPENS;

  @ApiPropertyOptional({
    description: "Rows for difficult texts list.",
    default: 6,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  difficultLimit?: number = 6;

  @ApiPropertyOptional({
    description: "Rows for popular texts list.",
    default: 7,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  popularLimit?: number = 7;

  @ApiPropertyOptional({
    description: "Rows for top active users.",
    default: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  topUsersLimit?: number = 5;

  @ApiPropertyOptional({
    description: "Rows for top unknown words.",
    default: 8,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  topUnknownWordsLimit?: number = 8;

  @ApiPropertyOptional({
    description: "Export format for /admin/analytics/export endpoint.",
    enum: AnalyticsExportFormat,
    default: AnalyticsExportFormat.JSON,
  })
  @IsOptional()
  @IsEnum(AnalyticsExportFormat)
  format?: AnalyticsExportFormat = AnalyticsExportFormat.JSON;
}
