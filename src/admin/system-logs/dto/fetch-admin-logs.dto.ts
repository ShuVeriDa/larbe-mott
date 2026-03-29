import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export enum AdminLogsLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
  CRITICAL = "critical",
}

export enum AdminLogsTab {
  ALL = "all",
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
  CRITICAL = "critical",
}

export enum AdminLogsRange {
  LAST_15_MIN = "15m",
  LAST_1_HOUR = "1h",
  LAST_24_HOURS = "24h",
  LAST_7_DAYS = "7d",
  LAST_30_DAYS = "30d",
  ALL = "all",
}

export enum AdminLogsExportFormat {
  JSON = "json",
  CSV = "csv",
}

export class FetchAdminLogsDto {
  @ApiPropertyOptional({
    description: "Free-text search across message and traceId.",
    example: "timeout stripe",
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: "Service filter. 'all' disables service filtering.",
    example: "text-processor",
    default: "all",
  })
  @IsOptional()
  @IsString()
  service?: string = "all";

  @ApiPropertyOptional({
    description: "Level filter.",
    enum: AdminLogsLevel,
  })
  @IsOptional()
  @IsEnum(AdminLogsLevel)
  level?: AdminLogsLevel;

  @ApiPropertyOptional({
    description: "Tab filter from UI. Overrides `level` when present.",
    enum: AdminLogsTab,
    default: AdminLogsTab.ALL,
  })
  @IsOptional()
  @IsEnum(AdminLogsTab)
  tab?: AdminLogsTab = AdminLogsTab.ALL;

  @ApiPropertyOptional({
    description: "Predefined period (ignored when dateFrom + dateTo are provided).",
    enum: AdminLogsRange,
    default: AdminLogsRange.LAST_24_HOURS,
  })
  @IsOptional()
  @IsEnum(AdminLogsRange)
  range?: AdminLogsRange = AdminLogsRange.LAST_24_HOURS;

  @ApiPropertyOptional({
    description: "Custom range start (ISO date-time).",
    example: "2026-03-25T00:00:00.000Z",
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: "Custom range end (ISO date-time).",
    example: "2026-03-25T23:59:59.999Z",
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: "Page number (1-based).", default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: "Items per page (1-100).", default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;

  @ApiPropertyOptional({
    description: "ISO timestamp cursor for live updates (fetch newer than this).",
    example: "2026-03-25T14:25:00.000Z",
  })
  @IsOptional()
  @IsDateString()
  since?: string;

  @ApiPropertyOptional({
    description: "Live feed batch size (1-200).",
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  liveLimit?: number = 50;

  @ApiPropertyOptional({
    description: "Export format used by /admin/logs/export.",
    enum: AdminLogsExportFormat,
    default: AdminLogsExportFormat.JSON,
  })
  @IsOptional()
  @IsEnum(AdminLogsExportFormat)
  format?: AdminLogsExportFormat = AdminLogsExportFormat.JSON;

  @ApiPropertyOptional({
    description: "Sort order by time.",
    enum: ["desc", "asc"],
    default: "desc",
  })
  @IsOptional()
  @IsIn(["desc", "asc"])
  order?: "desc" | "asc" = "desc";
}
