import { ApiProperty } from "@nestjs/swagger";
import { ArrayMinSize, IsArray, IsUUID } from "class-validator";

export class BulkDeleteUnknownWordsDto {
  @ApiProperty({
    description: "List of unknown word IDs to delete",
    type: [String],
    example: ["id-1", "id-2"],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID("all", { each: true })
  ids: string[];
}
