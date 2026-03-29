import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsInt } from "class-validator";
import { LevelProgressItemDto } from "./level-progress-item.dto";

export class UserLearningStatsDto {
  @ApiProperty({
    description: "Total number of texts with any progress for this user",
    example: 12,
  })
  @IsInt()
  textsRead: number;

  @ApiProperty({
    description: "Total number of words marked as KNOWN for this user",
    example: 250,
  })
  @IsInt()
  wordsKnown: number;

  @ApiProperty({
    description: "Total number of words currently in LEARNING status for this user",
    example: 80,
  })
  @IsInt()
  wordsLearning: number;

  @ApiProperty({
    description: "Total words saved to user's personal dictionary (UserDictionaryEntry count)",
    example: 1247,
  })
  @IsInt()
  dictionaryWordsCount: number;

  @ApiProperty({
    description: "Total folders in user's personal dictionary",
    example: 3,
  })
  @IsInt()
  dictionaryFoldersCount: number;

  @ApiProperty({
    description: "Total FAIL_LOOKUP events: words the user tapped that were not found in the dictionary",
    example: 312,
  })
  @IsInt()
  failLookupCount: number;

  @ApiProperty({
    description: "Current learning streak in days (consecutive days with activity)",
    example: 7,
  })
  @IsInt()
  streakDays: number;

  @ApiProperty({
    description: "Total study time in minutes, calculated from user activity events",
    example: 340,
  })
  @IsInt()
  totalStudyMinutes: number;

  @ApiProperty({
    description: "Progress grouped by CEFR level",
    type: [LevelProgressItemDto],
  })
  @IsArray()
  levelProgress: LevelProgressItemDto[];
}

