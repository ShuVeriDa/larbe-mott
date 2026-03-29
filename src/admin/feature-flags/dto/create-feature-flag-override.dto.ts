import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateFeatureFlagOverrideDto {
  @ApiProperty({ description: "Target feature flag id" })
  @IsString()
  flagId: string;

  @ApiProperty({
    description: "Target user ID or email",
    example: "550e8400-e29b-41d4-a716-446655440000",
  })
  @IsString()
  userIdOrEmail: string;

  @ApiProperty({ description: "Override value for this user" })
  @IsBoolean()
  isEnabled: boolean;

  @ApiPropertyOptional({
    description: "Reason for override",
    example: "Внутренний тест для support-команды",
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
