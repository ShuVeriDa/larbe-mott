import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class UpdateMorphFormDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  form?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  grammarTag?: string;
}
