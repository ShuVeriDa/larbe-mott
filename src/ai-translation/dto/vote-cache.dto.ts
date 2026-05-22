import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";

export type VoteType = "up" | "down";

export class VoteCacheDto {
  @ApiProperty({ enum: ["up", "down"] })
  @IsEnum(["up", "down"])
  vote: VoteType;
}
