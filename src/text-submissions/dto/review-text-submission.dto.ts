import { IsIn, IsOptional, IsString } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ReviewTextSubmissionDto {
  @ApiProperty({ enum: ["approve", "reject"] })
  @IsIn(["approve", "reject"])
  decision: "approve" | "reject";

  @ApiPropertyOptional({ description: "Комментарий редактора" })
  @IsOptional()
  @IsString()
  reviewComment?: string;
}
