import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class RefinePhraseDto {
  @ApiProperty({ description: "The original Chechen phrase" })
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  phrase: string;

  @ApiProperty({ description: "The first translation to refine" })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  previousTranslation: string;

  @ApiProperty({ description: "User hint about the correct meaning" })
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  hint: string;
}
