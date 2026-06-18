import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateSpellingEntryDto {
  @ApiProperty({ description: "The incorrect form to detect (stored lowercase, matched case-insensitively)", example: "вахнера" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  wrongForm: string;

  @ApiProperty({ description: "The correct form with proper spelling and/or stress marks", example: "вахне́ра" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  correctForm: string;

  @ApiPropertyOptional({ description: "Optional explanation for editors", example: "Ударение на второй слог" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
