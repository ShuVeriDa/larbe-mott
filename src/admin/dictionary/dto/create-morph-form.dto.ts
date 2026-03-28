import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { GrammaticalCase, GrammaticalNumber } from "@prisma/client";

export class CreateMorphFormDto {
  @ApiProperty({ description: "Inflected word form", example: "мотташан" })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  form: string;

  @ApiPropertyOptional({
    enum: GrammaticalCase,
    description: "Grammatical case: NOM | GEN | DAT | ERG | INS | LOC | ALL",
  })
  @IsOptional()
  @IsEnum(GrammaticalCase)
  gramCase?: GrammaticalCase;

  @ApiPropertyOptional({
    enum: GrammaticalNumber,
    description: "Grammatical number: SG | PL",
  })
  @IsOptional()
  @IsEnum(GrammaticalNumber)
  gramNumber?: GrammaticalNumber;

  @ApiPropertyOptional({ description: "Raw grammar tag string (optional)", example: "NOM.SG" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  grammarTag?: string;
}
