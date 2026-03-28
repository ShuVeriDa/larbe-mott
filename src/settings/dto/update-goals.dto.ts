import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";

export class UpdateGoalsDto {
  @ApiPropertyOptional({ enum: [5, 10, 20, 30, 50] })
  @IsOptional()
  @IsIn([5, 10, 20, 30, 50])
  dailyWords?: number;

  @ApiPropertyOptional({ enum: [5, 15, 30, 60] })
  @IsOptional()
  @IsIn([5, 15, 30, 60])
  dailyMinutes?: number;
}
