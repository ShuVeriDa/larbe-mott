import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateExampleDto {
  @ApiPropertyOptional({ description: "Example sentence in target language" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text?: string;

  @ApiPropertyOptional({ description: "Russian translation of the example" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  translation?: string;
}
