import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from "class-validator";

export class ReorderFoldersDto {
  @ApiProperty({
    description:
      "Folder IDs in the desired order. Index in the array becomes the new sortOrder.",
    type: [String],
    example: ["b1f7…", "c2a8…", "d3b9…"],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID("all", { each: true })
  orderedIds: string[];
}
