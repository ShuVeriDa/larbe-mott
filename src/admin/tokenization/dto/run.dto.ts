import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";

export enum RunScope {
  PENDING = "pending",
  ERRORS = "errors",
  ALL = "all",
}

export class RunTokenizationDto {
  @ApiProperty({
    enum: RunScope,
    description:
      "pending — только необработанные; errors — тексты с NOT_FOUND/AMBIGUOUS; all — полная переобработка всех",
  })
  @IsEnum(RunScope)
  scope: RunScope;
}
