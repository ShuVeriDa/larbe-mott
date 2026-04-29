import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

export class UpdateGoalsDto {
  @ApiPropertyOptional({ enum: [5, 10, 20, 30, 50] })
  @IsOptional()
  @IsIn([5, 10, 20, 30, 50])
  dailyWords?: number;

  @ApiPropertyOptional({ enum: [5, 15, 30, 60] })
  @IsOptional()
  @IsIn([5, 15, 30, 60])
  dailyMinutes?: number;

  @ApiPropertyOptional({ description: "Total active vocabulary target (50–100000)", default: 800 })
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(100_000)
  vocabularyGoal?: number;
}
