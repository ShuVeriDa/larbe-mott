import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { GrammaticalCase, GrammaticalNumber } from "@prisma/client";

export class UpdateMorphFormDto {
  @ApiPropertyOptional({ description: "Inflected word form", example: "мотташан" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  form?: string;

  @ApiPropertyOptional({ enum: GrammaticalCase })
  @IsOptional()
  @IsEnum(GrammaticalCase)
  gramCase?: GrammaticalCase;

  @ApiPropertyOptional({ enum: GrammaticalNumber })
  @IsOptional()
  @IsEnum(GrammaticalNumber)
  gramNumber?: GrammaticalNumber;

  @ApiPropertyOptional({ description: "Raw grammar tag string", example: "NOM.SG" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  grammarTag?: string;
}
