import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export const TRACKING_EVENT_TYPES = [
  "pageview",
  "text_open",
  "text_finish",
  "word_click",
  "word_add_dict",
  "word_dismiss",
  "ai_translation",
  "search",
] as const;

export type TrackingEventType = (typeof TRACKING_EVENT_TYPES)[number];

export class TrackEventDto {
  @ApiProperty({ enum: TRACKING_EVENT_TYPES, example: "pageview" })
  @IsString()
  @IsIn(TRACKING_EVENT_TYPES as unknown as string[])
  type!: TrackingEventType;

  @ApiPropertyOptional({ example: "/texts/abc123" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  path?: string;

  @ApiPropertyOptional({ example: "https://google.com" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  referrer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
