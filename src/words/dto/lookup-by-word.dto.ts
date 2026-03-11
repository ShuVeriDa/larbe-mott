import { IsString } from "class-validator";

export class WordLookupByWordDto {
  /** Нормализованная форма или исходное слово (нормализация выполнится на backend). */
  @IsString()
  normalized: string;
}
