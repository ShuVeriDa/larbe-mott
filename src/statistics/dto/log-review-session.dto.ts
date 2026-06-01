import { IsInt, Max, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class LogReviewSessionDto {
  @ApiProperty({ description: "Number of correct answers" })
  @IsInt()
  @Min(0)
  @Max(10_000)
  correct: number;

  @ApiProperty({ description: "Number of wrong answers" })
  @IsInt()
  @Min(0)
  @Max(10_000)
  wrong: number;
}
