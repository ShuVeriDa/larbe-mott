import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { ArrayNotEmpty, IsString } from "class-validator";

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.split(",").map((v) => v.trim()).filter(Boolean);
  return [];
};

export class FetchMyFeatureFlagsDto {
  @ApiProperty({
    description: "One or more feature flag keys to check for the current user",
    type: String,
    isArray: true,
    example: ["functional.arabic_language"],
  })
  @Transform(({ value }) => toStringArray(value))
  @ArrayNotEmpty()
  @IsString({ each: true })
  keys: string[];
}
