import { ApiPropertyOptional } from "@nestjs/swagger";
import { SpellingMatchType } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import { IsArray, IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";

const splitCommaSeparated = ({ value }: { value: unknown }): unknown => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const items = value.split(",").map((v) => v.trim()).filter(Boolean);
    return items.length > 0 ? items : undefined;
  }
  return value;
};

export class FetchSpellingOccurrencesDto {
  @ApiPropertyOptional({ description: "Page number (1-based)", example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: "Items per page", example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 20;

  @ApiPropertyOptional({
    type: [String],
    description: "Restrict occurrences to these text ids (comma-separated or repeated query param)",
    example: ["uuid-1", "uuid-2"],
  })
  @IsOptional()
  @Transform(splitCommaSeparated)
  @IsArray()
  @IsUUID("4", { each: true })
  textIds?: string[];

  @ApiPropertyOptional({
    description: "Override the entry's matchType for this search only (does not modify the stored entry)",
    enum: SpellingMatchType,
  })
  @IsOptional()
  @IsEnum(SpellingMatchType)
  matchType?: SpellingMatchType;
}
