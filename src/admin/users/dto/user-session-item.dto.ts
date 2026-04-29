import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsDate, IsOptional, IsString } from "class-validator";

export class UserSessionLocationDto {
  @ApiPropertyOptional({ description: "ISO country code (e.g. RU, US)", nullable: true })
  @IsString()
  @IsOptional()
  country: string | null;

  @ApiPropertyOptional({ description: "City name", nullable: true })
  @IsString()
  @IsOptional()
  city: string | null;
}

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

  @ApiPropertyOptional({
    description: "Parsed UA label, e.g. \"Chrome · macOS\"",
    nullable: true,
  })
  @IsString()
  @IsOptional()
  device: string | null;

  @ApiPropertyOptional({
    description: "Geo lookup result by IP, null for private/unknown IPs",
    type: UserSessionLocationDto,
    nullable: true,
  })
  @IsOptional()
  location: UserSessionLocationDto | null;

  @ApiProperty({ description: "Session created at", type: String, format: "date-time" })
  @IsDate()
  createdAt: Date;

  @ApiProperty({
    description:
      "Last activity timestamp (updated on every refresh-token rotation)",
    type: String,
    format: "date-time",
  })
  @IsDate()
  lastActiveAt: Date;

  @ApiPropertyOptional({ description: "Revoked at, null if still active", type: String, format: "date-time", nullable: true })
  @IsDate()
  @IsOptional()
  revokedAt: Date | null;

  @ApiProperty({ description: "True when revokedAt is null" })
  @IsBoolean()
  isActive: boolean;

  @ApiProperty({
    description:
      "True for the most recent active session (latest lastActiveAt among isActive=true)",
  })
  @IsBoolean()
  isLatest: boolean;
}
