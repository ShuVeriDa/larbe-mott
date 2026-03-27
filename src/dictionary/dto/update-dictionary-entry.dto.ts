// update-entry.dto.ts
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Level, WordStatus } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, IsUUID, Min } from "class-validator";

export class UpdateDictionaryEntryDto {
  @ApiPropertyOptional({
    description: "Learning level (mark as learned, etc.)",
    enum: WordStatus,
  })
  @IsOptional()
  @IsEnum(WordStatus)
  learningLevel?: WordStatus;

  @ApiPropertyOptional({
    description: "CEFR level of the word (A1, A2, B1, B2)",
    enum: Level,
  })
  @IsOptional()
  @IsEnum(Level)
  cefrLevel?: Level | null;

  @ApiPropertyOptional({
    description: "Move to folder. Pass null to remove from folder.",
  })
  @IsOptional()
  @IsUUID()
  folderId?: string | null;

  @ApiPropertyOptional({
    description: "Repetition count (e.g. after quiz)",
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  repetitionCount?: number;
}
