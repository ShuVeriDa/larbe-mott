import { ApiProperty } from "@nestjs/swagger";
import { ArrayMinSize, IsArray, IsUUID } from "class-validator";

export class BulkUsersActionDto {
  @ApiProperty({
    description: "List of user IDs to apply action to",
    type: [String],
    example: ["uuid-1", "uuid-2"],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID("all", { each: true })
  ids: string[];
}
