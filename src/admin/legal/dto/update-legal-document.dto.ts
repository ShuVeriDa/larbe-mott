import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/**
 * Обновление контента/заголовка существующего документа.
 * slug и lang не меняются (идентифицируют документ).
 * isPublished меняется отдельными эндпоинтами publish/unpublish.
 */
export class UpdateLegalDocumentDto {
  @ApiPropertyOptional({ example: "Политика конфиденциальности (ред.)" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: "# Новый заголовок\n\nИсправленный текст..." })
  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;
}
