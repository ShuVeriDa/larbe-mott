import { ApiPropertyOptional } from "@nestjs/swagger";
import { Language } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class FetchSpellingEntriesDto {
  @ApiPropertyOptional({ description: "Page number (1-based)", example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: "Items per page", example: 50, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional({ description: "Filter by wrongForm or correctForm (case-insensitive)", example: "вахне" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: "Filter by language",
    enum: Language,
    default: Language.CHE,
  })
  @IsOptional()
  @IsEnum(Language)
  language?: Language;
}
