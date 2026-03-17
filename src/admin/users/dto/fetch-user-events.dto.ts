import { ApiPropertyOptional } from "@nestjs/swagger";
import { UserEventType } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from "class-validator";

export class FetchUserEventsDto {
  @ApiPropertyOptional({
    description: "Filter by event type",
    enum: UserEventType,
  })
  @IsOptional()
  @IsEnum(UserEventType)
  type?: UserEventType;

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

  @ApiPropertyOptional({ description: "Page number (1-based)", default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: "Items per page (1–200)",
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}

