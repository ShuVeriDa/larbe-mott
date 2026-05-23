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
      "pending — unprocessed only; errors — texts with NOT_FOUND/AMBIGUOUS tokens; all — full reprocessing of all texts",
  })
  @IsEnum(RunScope)
  scope: RunScope;
}
