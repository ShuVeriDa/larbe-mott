import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateTextSubmissionDto {
  @ApiProperty({ description: "Название текста или книги" })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiProperty({ description: "Язык текста (che, ru, en, other)" })
  @IsString()
  @MinLength(1)
  language: string;

  @ApiPropertyOptional({ description: "Автор текста" })
  @IsOptional()
  @IsString()
  author?: string;

  @ApiPropertyOptional({ description: "Ссылка на источник" })
  @IsOptional()
  @IsUrl()
  sourceUrl?: string;

  @ApiPropertyOptional({ description: "Текст (вставка), максимум 100 000 символов" })
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  content?: string;

  @ApiPropertyOptional({ description: "Комментарий автора" })
  @IsOptional()
  @IsString()
  comment?: string;
}
