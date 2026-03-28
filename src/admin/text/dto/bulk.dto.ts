import { ApiProperty } from "@nestjs/swagger";
import { ArrayMinSize, IsArray, IsUUID } from "class-validator";

export class BulkTextIdsDto {
  @ApiProperty({
    type: [String],
    description: "Array of text UUIDs to act on",
    example: ["uuid-1", "uuid-2"],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID("4", { each: true })
  ids: string[];
}
