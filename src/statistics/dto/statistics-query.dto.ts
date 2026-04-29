import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export enum StatPeriod {
  WEEK = "week",
  MONTH = "month",
  YEAR = "year",
  ALL = "all",
}

export class StatisticsQueryDto {
  @ApiPropertyOptional({ enum: StatPeriod, default: StatPeriod.MONTH })
  @IsEnum(StatPeriod)
  @IsOptional()
  period?: StatPeriod = StatPeriod.MONTH;

  @ApiPropertyOptional({ description: "Max items in recentActivity (1–50). Default 15.", default: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  activityLimit?: number;
}
