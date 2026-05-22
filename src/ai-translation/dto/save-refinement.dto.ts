import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class SaveRefinementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  word: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  translation: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  contextSentence?: string;
}
