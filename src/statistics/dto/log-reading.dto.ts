import { IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class LogReadingDto {
  @ApiProperty({ description: "Text ID" })
  @IsUUID()
  textId: string;

  @ApiProperty({ description: "Duration spent reading in seconds" })
  @IsInt()
  @Min(1)
  @Max(86_400)
  durationSeconds: number;

  @ApiProperty({ description: "Number of words on the page(s) read", required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  wordsRead?: number;
}
