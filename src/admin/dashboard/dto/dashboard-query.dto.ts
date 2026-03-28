import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";

export class DashboardQueryDto {
  @ApiPropertyOptional({
    enum: ["week", "month", "year", "all"],
    default: "month",
    description: "Predefined period. Ignored if dateFrom + dateTo are provided.",
  })
  @IsOptional()
  @IsIn(["week", "month", "year", "all"])
  period?: "week" | "month" | "year" | "all";

  @ApiPropertyOptional({ description: "Custom range start (ISO date)", example: "2025-01-01" })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: "Custom range end (ISO date)", example: "2025-03-31" })
  @IsOptional()
  @IsString()
  dateTo?: string;
}
