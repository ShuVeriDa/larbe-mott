import { IsOptional, IsString, MinLength } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class CreateSuggestionDto {
  // --- entry path (existing) ---

  @ApiPropertyOptional({ description: "Нормализованная форма слова (только для entry-правок)" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  normalized?: string;

  @ApiPropertyOptional({ description: "Оригинальное написание слова (только для entry-правок)" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  rawWord?: string;

  @ApiPropertyOptional({ description: "Текущий перевод слова (для создания DictionaryEntry если её нет)" })
  @IsOptional()
  @IsString()
  currentTranslation?: string;

  @ApiPropertyOptional({ description: "ID записи словаря (альтернатива rawWord)" })
  @IsOptional()
  @IsString()
  entryId?: string;

  // --- text path (new) ---

  @ApiPropertyOptional({ description: "ID текста (для правок метаданных текста)" })
  @IsOptional()
  @IsString()
  textId?: string;

  // --- shared ---

  @ApiPropertyOptional({ description: "Поле, которое нужно изменить" })
  @IsString()
  field: string;

  @ApiPropertyOptional({ description: "Предложенное новое значение" })
  @IsString()
  @MinLength(1)
  newValue: string;

  @ApiPropertyOptional({ description: "Комментарий автора правки" })
  @IsOptional()
  @IsString()
  comment?: string;
}
