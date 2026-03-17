import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsString } from "class-validator";

export class SetUserFeatureFlagDto {
  @ApiProperty({ description: "Target user ID (UUID)" })
  @IsString()
  userId: string;

  @ApiProperty({ description: "Override flag state for this user" })
  @IsBoolean()
  isEnabled: boolean;
}

