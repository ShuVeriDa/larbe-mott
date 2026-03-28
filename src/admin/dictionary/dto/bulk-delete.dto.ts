import { ArrayNotEmpty, IsArray, IsUUID } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class BulkDeleteDto {
  @ApiProperty({
    description: "Array of lemma IDs to delete",
    type: [String],
    example: ["uuid1", "uuid2"],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("4", { each: true })
  ids: string[];
}
