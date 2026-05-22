import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class TranslatePhraseDto {
  @ApiProperty({ description: "The Chechen phrase to translate" })
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  phrase: string;

  @ApiPropertyOptional({ description: "Surrounding sentence for context" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  contextSentence?: string;
}
