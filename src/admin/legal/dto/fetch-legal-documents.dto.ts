import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator";
import { SUPPORTED_LANGS } from "src/legal/legal.service";

export class FetchLegalDocumentsDto {
  @ApiPropertyOptional({ description: "Filter by slug", example: "privacy" })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({ enum: SUPPORTED_LANGS, example: "ru" })
  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_LANGS as readonly string[])
  lang?: string;

  @ApiPropertyOptional({
    description:
      "true — published only, false — drafts only, omitted — all",
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === "true" || value === true) return true;
    if (value === "false" || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  isPublished?: boolean;
}
