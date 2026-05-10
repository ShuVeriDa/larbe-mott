import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsString, Min } from "class-validator";

export class CreateHighlightDto {
  @ApiProperty()
  @IsString()
  textId: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  pageNumber: number;

  @ApiProperty({ enum: ["yellow", "green", "blue", "pink"] })
  @IsIn(["yellow", "green", "blue", "pink"])
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
