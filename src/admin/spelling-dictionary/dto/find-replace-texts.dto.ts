import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { SpellingMatchType } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class FindReplaceTextsDto {
  @ApiProperty({ description: "The form to search for", example: "вахнера" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  wrongForm: string;

  @ApiProperty({ description: "How wrongForm is matched in text", enum: SpellingMatchType })
  @IsEnum(SpellingMatchType)
  matchType: SpellingMatchType;

  @ApiPropertyOptional({ description: "Filter texts by title (case-insensitive)", example: "Кицаш" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
