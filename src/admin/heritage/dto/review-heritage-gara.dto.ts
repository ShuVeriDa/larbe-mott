import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { HeritageReviewAction } from "./review-heritage-taip.dto";

export class ReviewHeritageGaraDto {
  @ApiProperty({ enum: HeritageReviewAction })
  @IsEnum(HeritageReviewAction)
  action: HeritageReviewAction;

  @ApiPropertyOptional({
    description: "Add custom gara to the official directory (only with action=verify)",
  })
  @IsOptional()
  @IsBoolean()
  addToDirectory?: boolean;

  @ApiPropertyOptional({
    description: "taipId to assign if addToDirectory=true",
  })
  @IsOptional()
  @IsString()
  taipId?: string;

  @ApiPropertyOptional({ description: "Reason for rejection", maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  rejectReason?: string;
}
