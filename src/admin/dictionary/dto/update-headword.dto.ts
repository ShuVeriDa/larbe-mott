import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

/** DTO for PATCH /admin/dictionary/headwords/:hwId */
export class UpdateHeadwordDto {
  @ApiPropertyOptional({ description: "Headword text", example: "мот" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  word?: string;

  @ApiPropertyOptional({ description: "Mark as primary headword" })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ description: "Sort order within the entry" })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
