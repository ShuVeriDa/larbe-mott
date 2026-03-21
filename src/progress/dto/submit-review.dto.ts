import { ApiProperty } from "@nestjs/swagger";
import { IsInt, Max, Min } from "class-validator";

export class SubmitReviewDto {
  @ApiProperty({
    description: "Quality of recall: 0-2 = failed, 3 = correct with difficulty, 4 = correct, 5 = perfect",
    minimum: 0,
    maximum: 5,
    example: 4,
  })
  @IsInt()
  @Min(0)
  @Max(5)
  quality: number;
}
