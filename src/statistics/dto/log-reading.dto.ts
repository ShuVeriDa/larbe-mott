import { IsInt, IsString, IsUUID, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class LogReadingDto {
  @ApiProperty({ description: "Text ID" })
  @IsUUID()
  textId: string;

  @ApiProperty({ description: "Duration spent reading in seconds" })
  @IsInt()
  @Min(1)
  durationSeconds: number;
}
