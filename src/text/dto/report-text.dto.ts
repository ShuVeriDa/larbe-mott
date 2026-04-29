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
      "Категория жалобы. SPAM — спам/реклама, INAPPROPRIATE — недопустимый контент, " +
      "COPYRIGHT — нарушение авторских прав, INCORRECT_CONTENT — ошибки в тексте, " +
      "BROKEN — технические проблемы, OTHER — другое.",
  })
  @IsEnum(TextReportReason)
  reason: TextReportReason;

  @ApiPropertyOptional({
    description: "Свободный комментарий пользователя",
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
