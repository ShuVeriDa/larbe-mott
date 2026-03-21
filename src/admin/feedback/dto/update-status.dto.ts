import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";
import { FeedbackStatus } from "@prisma/client";

export class UpdateFeedbackStatusDto {
  @ApiProperty({ enum: FeedbackStatus })
  @IsEnum(FeedbackStatus)
  status: FeedbackStatus;
}
