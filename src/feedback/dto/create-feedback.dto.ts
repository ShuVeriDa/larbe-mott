import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { FeedbackContextType, FeedbackType } from "@prisma/client";

export class CreateFeedbackDto {
  @ApiProperty({ enum: FeedbackType })
  @IsEnum(FeedbackType)
  type: FeedbackType;

  @ApiPropertyOptional({ description: "Short thread subject", maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiProperty({ description: "First message body", minLength: 1, maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;

  // --- optional context ---

  @ApiPropertyOptional({ enum: FeedbackContextType })
  @IsOptional()
  @IsEnum(FeedbackContextType)
  contextType?: FeedbackContextType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  contextWord?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  contextSentence?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contextLemmaId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contextTextId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  contextPosition?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  contextAction?: string;
}
