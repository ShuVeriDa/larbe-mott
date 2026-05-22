import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from "class-validator";

export class BatchTranslateDto {
  @ApiProperty({ description: "Unique Chechen words to translate", type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  words: string[];
}
