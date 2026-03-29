import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class SetUserFeatureFlagDto {
  @ApiProperty({ description: "Target user ID (UUID)" })
  @IsString()
  userId: string;

  @ApiProperty({ description: "Override flag state for this user" })
  @IsBoolean()
  isEnabled: boolean;

  @ApiProperty({
    description: "Reason for override",
    required: false,
    example: "QA доступ к новой функции",
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

