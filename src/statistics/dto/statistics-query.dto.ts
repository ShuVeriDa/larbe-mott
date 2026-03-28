import { IsEnum, IsOptional } from "class-validator";
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
}
