import { ApiProperty } from "@nestjs/swagger";
import { Level } from "@prisma/client";
import { IsEnum, IsInt } from "class-validator";

export class LevelProgressItemDto {
  @ApiProperty({
    description: "Language level (CEFR)",
    enum: Level,
  })
  @IsEnum(Level)
  level: Level;

  @ApiProperty({
    description: "Number of texts with any progress for this level",
    example: 5,
  })
  @IsInt()
  textsCount: number;
}

