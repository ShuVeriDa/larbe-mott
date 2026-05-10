import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class UpdateNoteDto {
  @ApiProperty()
  @IsString()
  body: string;
}
