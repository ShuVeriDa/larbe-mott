import { IsIn, IsOptional, IsString } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ReviewSuggestionDto {
  @ApiProperty({ enum: ["approve", "reject"] })
  @IsIn(["approve", "reject"])
  decision: "approve" | "reject";

  @ApiPropertyOptional({ description: "Комментарий рецензента" })
  @IsOptional()
  @IsString()
  comment?: string;
}
