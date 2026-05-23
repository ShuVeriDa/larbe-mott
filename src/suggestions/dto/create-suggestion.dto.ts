import { IsOptional, IsString, MinLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateSuggestionDto {
  @ApiProperty({ description: "Нормализованная форма слова" })
  @IsString()
  @MinLength(1)
  normalized: string;

  @ApiProperty({ description: "Оригинальное написание слова" })
  @IsString()
  @MinLength(1)
  rawWord: string;

  @ApiProperty({ description: "Текущий перевод слова (для создания DictionaryEntry если её нет)" })
  @IsString()
  currentTranslation: string;

  @ApiProperty({ description: "Поле, которое нужно изменить (например: rawTranslate, notes)" })
  @IsString()
  field: string;

  @ApiProperty({ description: "Предложенное новое значение" })
  @IsString()
  @MinLength(1)
  newValue: string;

  @ApiPropertyOptional({ description: "Комментарий автора правки" })
  @IsOptional()
  @IsString()
  comment?: string;
}
