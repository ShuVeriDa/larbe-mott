import { ApiPropertyOptional } from "@nestjs/swagger";
import { Language } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";

export class FetchAllSpellingEntriesDto {
  @ApiPropertyOptional({
    description: "Filter by language",
    enum: Language,
    default: Language.CHE,
  })
  @IsOptional()
  @IsEnum(Language)
  language?: Language;
}
