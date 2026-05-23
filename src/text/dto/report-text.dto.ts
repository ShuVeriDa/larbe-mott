import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export enum TextReportReason {
  SPAM = "SPAM",
  INAPPROPRIATE = "INAPPROPRIATE",
  COPYRIGHT = "COPYRIGHT",
  INCORRECT_CONTENT = "INCORRECT_CONTENT",
  BROKEN = "BROKEN",
  OTHER = "OTHER",
}

export class ReportTextDto {
  @ApiProperty({
    enum: TextReportReason,
    description:
      "Report category. SPAM — spam/advertising, INAPPROPRIATE — inappropriate content, " +
      "COPYRIGHT — copyright violation, INCORRECT_CONTENT — errors in the text, " +
      "BROKEN — technical issues, OTHER — other.",
  })
  @IsEnum(TextReportReason)
  reason: TextReportReason;

  @ApiPropertyOptional({
    description: "Free-form comment from the user",
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
