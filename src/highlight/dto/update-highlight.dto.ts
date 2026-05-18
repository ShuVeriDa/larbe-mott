import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class UpdateHighlightDto {
  @ApiPropertyOptional({ enum: ["yellow", "green", "blue", "pink", "orange", "purple", "teal", "red"], description: "Named color key or any hex string" })
  @IsOptional()
  @IsString()
  color?: string;
}
