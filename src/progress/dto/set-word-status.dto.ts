import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";

export class SetWordStatusDto {
  @ApiProperty({
    description: "Target word status",
    enum: ["NEW", "LEARNING", "KNOWN"],
    example: "KNOWN",
  })
  @IsIn(["NEW", "LEARNING", "KNOWN"])
  status: "NEW" | "LEARNING" | "KNOWN";
}
