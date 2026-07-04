import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class FetchSpellingOccurrenceTextsDto {
  @ApiPropertyOptional({ description: "Filter texts by title (case-insensitive)", example: "Кицаш" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
