import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Language } from "@prisma/client";
import { IsArray, IsOptional, IsString, Matches } from "class-validator";

export class AddToDictionaryDto {
  @ApiProperty({
    enum: Language,
    description: `Language: ${Language.CHE} | ${Language.RU}`,
  })
  @Matches(
    `^${Object.values(Language)
      .filter((v) => typeof v !== "number")
      .join("|")}$`,
    "i",
  )
  language: Language;

  @ApiProperty({ description: "Translation text", example: "car" })
  @IsString()
  translation: string;

  @ApiPropertyOptional({
    description: "Part of speech",
    example: "noun",
  })
  @IsOptional()
  @IsString()
  partOfSpeech?: string;

  @ApiPropertyOptional({ description: "Notes" })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: "Inflected forms (array of strings)",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  forms?: string[];
}
