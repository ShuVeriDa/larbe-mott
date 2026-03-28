import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";

export class ProblematicTokensQueryDto {
  @ApiPropertyOptional({
    enum: ["NOT_FOUND", "AMBIGUOUS"],
    description: "Фильтр по статусу токена. Без фильтра — оба статуса",
  })
  @IsEnum(["NOT_FOUND", "AMBIGUOUS"])
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}
