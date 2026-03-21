import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class AnalyzeWordDto {
  @ApiProperty({ description: "Word to analyze" })
  @IsString()
  word: string;
}
