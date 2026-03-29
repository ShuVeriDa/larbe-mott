import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches } from "class-validator";

export class DuplicateFeatureFlagDto {
  @ApiProperty({
    description: "New unique key for duplicated feature flag",
    example: "reader.new_toolbar_copy",
  })
  @IsString()
  @Matches(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, {
    message: "key must use dot notation like category.feature_name",
  })
  key: string;
}
