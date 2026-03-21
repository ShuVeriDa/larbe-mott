import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class CreateMorphFormDto {
  @ApiProperty({ description: "Surface form of the word" })
  @IsString()
  form: string;

  @ApiPropertyOptional({ description: "Grammar tag (e.g. NOM.SG, GEN.PL)" })
  @IsOptional()
  @IsString()
  grammarTag?: string;
}
