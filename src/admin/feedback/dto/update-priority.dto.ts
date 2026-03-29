import { ApiProperty } from "@nestjs/swagger";
import { FeedbackPriority } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UpdateFeedbackPriorityDto {
  @ApiProperty({ enum: FeedbackPriority })
  @IsEnum(FeedbackPriority)
  priority: FeedbackPriority;
}
