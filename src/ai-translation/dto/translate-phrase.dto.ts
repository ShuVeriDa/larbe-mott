import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class TranslatePhraseDto {
  @ApiProperty({ description: "The Chechen phrase to translate" })
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  phrase: string;
}
