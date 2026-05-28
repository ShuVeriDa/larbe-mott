import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsString } from "class-validator";
import { SUPPORTED_GEMINI_MODELS, type GeminiModel } from "../gemini.util";

export class SaveGeminiModelDto {
  @ApiProperty({
    description: "Gemini model to use for translations",
    enum: SUPPORTED_GEMINI_MODELS,
  })
  @IsString()
  @IsIn(SUPPORTED_GEMINI_MODELS)
  model: GeminiModel;
}
