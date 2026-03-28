import { IsOptional, IsString, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateExampleDto {
  @ApiProperty({ description: "Example sentence in the target language", example: "Со мотт ца хаьа." })
  @IsString()
  @MaxLength(2000)
  text: string;

  @ApiPropertyOptional({ description: "Russian translation of the example" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  translation?: string;
}
