import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsString, Min } from "class-validator";

export class CreateHighlightDto {
  @ApiProperty()
  @IsString()
  textId: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  pageNumber: number;

  @ApiProperty({ enum: ["yellow", "green", "blue", "pink", "orange", "purple", "teal", "red"], description: "Named color key or any hex string" })
  @IsString()
  color: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  startOffset: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  endOffset: number;

  @ApiProperty()
  @IsString()
  selectedText: string;
}
