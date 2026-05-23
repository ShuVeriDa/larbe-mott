import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";

export class ProblematicTokensQueryDto {
  @ApiPropertyOptional({
    enum: ["NOT_FOUND", "AMBIGUOUS"],
    description: "Filter by token status. Without filter — both statuses",
  })
  @IsEnum(["NOT_FOUND", "AMBIGUOUS"])
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({
    enum: ["ADMIN", "CACHE", "MORPHOLOGY", "ONLINE"],
    description: "Filter by analysis source (primary analysis source)",
  })
  @IsEnum(["ADMIN", "CACHE", "MORPHOLOGY", "ONLINE"])
  @IsOptional()
  source?: string;

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
