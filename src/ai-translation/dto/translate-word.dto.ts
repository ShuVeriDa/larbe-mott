import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class TranslateWordDto {
  @ApiProperty({ description: "The Chechen word (lemma/surface form) to translate" })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  word: string;

  @ApiPropertyOptional({ description: "Context sentence containing the word" })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  contextSentence?: string;
}
