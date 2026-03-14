import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/** DTO for PATCH /tokens/:id — edit single token (admin). Does not trigger re-tokenization. */
export class UpdateTokenDto {
  @ApiPropertyOptional({
    description: "Original word as shown in text (e.g. fix typo)",
    example: "бусулба",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  original?: string;

  @ApiPropertyOptional({
    description: "Normalized form for dictionary lookup",
    example: "бусулба",
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  normalized?: string;

  @ApiPropertyOptional({
    description:
      "TextVocabulary id to link token to dictionary entry, or null to unlink",
    example: "clxx1234567890abcdef",
    nullable: true,
  })
  @IsOptional()
  @IsString()
  vocabId?: string | null;
}
