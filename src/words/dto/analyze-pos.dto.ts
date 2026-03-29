import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class AnalyzePosDto {
  @ApiProperty({
    description: "Chechen text to analyze",
    example: "Со тахана дешар доьшу.",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  text: string;
}
