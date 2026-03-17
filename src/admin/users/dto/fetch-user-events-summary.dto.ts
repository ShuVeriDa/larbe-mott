import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional } from "class-validator";

export class FetchUserEventsSummaryDto {
  @ApiPropertyOptional({
    description: "Filter events created after this date (ISO)",
    example: "2026-03-01T00:00:00.000Z",
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: "Filter events created before this date (ISO)",
    example: "2026-03-31T23:59:59.999Z",
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

