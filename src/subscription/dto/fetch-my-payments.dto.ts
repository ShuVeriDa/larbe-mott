import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class FetchMyPaymentsDto {
  @ApiPropertyOptional({
    description: "Page size (default 20, max 100)",
    example: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: "Cursor — id последнего платежа предыдущей страницы.",
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
