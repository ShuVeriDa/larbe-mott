import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Language, Level } from "@prisma/client";
import { IsArray, IsEnum, IsOptional, IsString, Matches } from "class-validator";

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

  @ApiProperty({ description: "Translation text", example: "книга" })
  @IsString()
  translation: string;

  @ApiPropertyOptional({
    description:
      "Headword (lemma form). If omitted, the unknown word's surface form is used.",
    example: "дош",
  })
  @IsOptional()
  @IsString()
  headword?: string;

  @ApiPropertyOptional({
    description: "Part of speech",
    example: "noun",
  })
  @IsOptional()
  @IsString()
  partOfSpeech?: string;

  @ApiPropertyOptional({
    description: "CEFR level",
    enum: Level,
  })
  @IsOptional()
  @IsEnum(Level)
  level?: Level;

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
