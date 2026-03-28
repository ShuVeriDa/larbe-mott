import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional } from "class-validator";

export class ProcessTextDto {
  @ApiPropertyOptional({
    default: true,
    description: "Run normalization step (lowercase, diacritics stripping)",
  })
  @IsBoolean()
  @IsOptional()
  useNormalization?: boolean;

  @ApiPropertyOptional({
    default: true,
    description: "Run full morphological analysis pipeline (dictionary, cache, online lookup)",
  })
  @IsBoolean()
  @IsOptional()
  useMorphAnalysis?: boolean;
}
