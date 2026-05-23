import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
} from "class-validator";

export class UpdateNotificationsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  repeatReminder?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  weeklyReport?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  newTexts?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  supportReplies?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  marketing?: boolean;

  @ApiPropertyOptional({ example: "09:00" })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "reminderTime must be HH:MM" })
  reminderTime?: string;

  @ApiPropertyOptional({
    example: "Europe/Moscow",
    description:
      "Timezone in IANA format (Area/City). Used by the cron scheduler for email reminders.",
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]+(?:\/[A-Za-z_+\-0-9]+){1,2}$/, {
    message:
      "timezone must be a valid IANA zone (e.g. 'Europe/Moscow', 'America/New_York', 'Asia/Tashkent')",
  })
  timezone?: string;
}
