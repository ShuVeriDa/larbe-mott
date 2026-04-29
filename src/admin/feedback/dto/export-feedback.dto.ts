import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional } from "class-validator";
import { FetchAdminFeedbackDto } from "./fetch-admin-feedback.dto";

export enum FeedbackExportFormat {
  JSON = "json",
  CSV = "csv",
}

export class ExportAdminFeedbackDto extends FetchAdminFeedbackDto {
  @ApiPropertyOptional({ enum: FeedbackExportFormat, default: FeedbackExportFormat.JSON })
  @IsOptional()
  @IsEnum(FeedbackExportFormat)
  format?: FeedbackExportFormat = FeedbackExportFormat.JSON;
}
