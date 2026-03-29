import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";

export class SetFeatureFlagOverrideDto {
  @ApiProperty({ description: "Override value for this specific user" })
  @IsBoolean()
  isEnabled: boolean;
}
