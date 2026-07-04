import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString } from "class-validator";
import { SUPPORTED_SOURCE_LANGUAGES } from "./translation-language";
import type { SourceLanguage } from "./translation-language";

export class BatchTranslateDto {
  @ApiProperty({ description: "Unique words to translate", type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  words: string[];

  @ApiPropertyOptional({
    description: "Source language of the words being translated",
    enum: SUPPORTED_SOURCE_LANGUAGES,
    default: "che",
  })
  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_SOURCE_LANGUAGES)
  sourceLanguage?: SourceLanguage;
}
