import { ApiProperty } from "@nestjs/swagger";
import { Language, Level } from "@prisma/client";

export class TextTagDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class TextListItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ required: false, nullable: true })
  description?: string | null;

  @ApiProperty({ enum: Language })
  language: Language;

  @ApiProperty({ enum: Level, required: false, nullable: true })
  level?: Level | null;

  @ApiProperty({ required: false, nullable: true })
  author?: string | null;

  @ApiProperty({ required: false, nullable: true })
  imageUrl?: string | null;

  @ApiProperty({ type: [TextTagDto] })
  tags: TextTagDto[];

  @ApiProperty()
  wordCount: number;

  @ApiProperty()
  readingTime: number;

  @ApiProperty()
  progressPercent: number;

  @ApiProperty({ enum: ["NEW", "IN_PROGRESS", "COMPLETED"] })
  progressStatus: "NEW" | "IN_PROGRESS" | "COMPLETED";

  @ApiProperty({ required: false, nullable: true })
  lastOpened?: Date | null;

  @ApiProperty()
  isNew: boolean;

  @ApiProperty()
  isFavorite: boolean;
}

export class TextsListCountsDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  new: number;

  @ApiProperty()
  inProgress: number;

  @ApiProperty()
  completed: number;
}

export class GetTextsResponseDto {
  @ApiProperty({ type: [TextListItemDto] })
  items: TextListItemDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty({ type: TextsListCountsDto })
  counts: TextsListCountsDto;
}
