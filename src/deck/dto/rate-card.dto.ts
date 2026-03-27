import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";

export class RateCardDto {
  @ApiProperty({
    description: "Review result: 'know' — remembered, 'again' — did not remember",
    enum: ["know", "again"],
    example: "know",
  })
  @IsIn(["know", "again"])
  result: "know" | "again";
}
