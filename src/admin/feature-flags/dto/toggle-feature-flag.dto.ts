import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";

export class ToggleFeatureFlagDto {
  @ApiProperty({ description: "New global state for flag" })
  @IsBoolean()
  isEnabled: boolean;
}
