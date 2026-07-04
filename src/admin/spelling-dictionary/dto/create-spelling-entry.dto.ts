import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { SpellingMatchType } from "@prisma/client";
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateSpellingEntryDto {
  @ApiProperty({ description: "The incorrect form to detect (stored lowercase, matched case-insensitively)", example: "вахнера" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  wrongForm: string;

  @ApiProperty({ description: "The primary correct form with proper spelling and/or stress marks", example: "вахне́ра" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  correctForm: string;

  @ApiPropertyOptional({ description: "Additional correct forms (alternative spellings)", example: ["вахнера"] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  correctForms?: string[];

  @ApiPropertyOptional({
    description: "How the wrongForm is matched in text",
    enum: SpellingMatchType,
    default: SpellingMatchType.substring,
  })
  @IsOptional()
  @IsEnum(SpellingMatchType)
  matchType?: SpellingMatchType;

  @ApiPropertyOptional({ description: "Optional explanation for editors", example: "Ударение на второй слог" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
