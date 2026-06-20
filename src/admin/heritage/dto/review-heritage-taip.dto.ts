import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export enum HeritageReviewAction {
  VERIFY = "verify",
  REJECT = "reject",
}

export class ReviewHeritageTaipDto {
  @ApiProperty({ enum: HeritageReviewAction })
  @IsEnum(HeritageReviewAction)
  action: HeritageReviewAction;

  @ApiPropertyOptional({
    description: "Add custom taip to the official directory (only with action=verify)",
  })
  @IsOptional()
  @IsBoolean()
  addToDirectory?: boolean;

  @ApiPropertyOptional({
    description: "tukhumId to assign if addToDirectory=true",
  })
  @IsOptional()
  @IsString()
  tukhumId?: string;

  @ApiPropertyOptional({
    description: "nationId to assign if addToDirectory=true",
  })
  @IsOptional()
  @IsString()
  nationId?: string;

  @ApiPropertyOptional({ description: "Reason for rejection", maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  rejectReason?: string;
}
