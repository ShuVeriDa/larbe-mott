import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Min } from "class-validator";

export class CreateNoteDto {
  @ApiProperty()
  @IsString()
  textId: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  pageNumber: number;

  @ApiPropertyOptional({ description: "Highlighted text fragment the note is attached to" })
  @IsOptional()
  @IsString()
  selectedText?: string;

  @ApiProperty()
  @IsString()
  body: string;
}
