import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsDate, IsOptional, IsString } from "class-validator";

export class UserSessionItemDto {
  @ApiProperty({ description: "Session ID" })
  @IsString()
  id: string;

  @ApiPropertyOptional({ description: "IP address", nullable: true })
  @IsString()
  @IsOptional()
  ipAddress: string | null;

  @ApiPropertyOptional({ description: "User-Agent string", nullable: true })
  @IsString()
  @IsOptional()
  userAgent: string | null;

  @ApiProperty({ description: "Session created at", type: String, format: "date-time" })
  @IsDate()
  createdAt: Date;

  @ApiPropertyOptional({ description: "Revoked at, null if still active", type: String, format: "date-time", nullable: true })
  @IsDate()
  @IsOptional()
  revokedAt: Date | null;

  @ApiProperty({ description: "True when revokedAt is null" })
  @IsBoolean()
  isActive: boolean;
}
