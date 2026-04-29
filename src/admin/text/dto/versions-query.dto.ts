import { ApiPropertyOptional } from "@nestjs/swagger";
import { ProcessingStatus } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";

export class VersionsQueryDto {
  @ApiPropertyOptional({
    enum: ProcessingStatus,
    description:
      "Filter versions by processing status. When omitted, all versions are returned. Counters in the response (total/successCount/errorCount) always reflect the full history regardless of this filter.",
  })
  @IsOptional()
  @IsEnum(ProcessingStatus)
  status?: ProcessingStatus;
}
