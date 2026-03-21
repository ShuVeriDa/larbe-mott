import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString } from "class-validator";

export class UpdateLemmaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  baseForm?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  partOfSpeech?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  frequency?: number;
}
