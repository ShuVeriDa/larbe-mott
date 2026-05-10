import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";

export class UpdateHighlightDto {
  @ApiPropertyOptional({ enum: ["yellow", "green", "blue", "pink"] })
  @IsOptional()
  @IsIn(["yellow", "green", "blue", "pink"])
  color?: string;
}
