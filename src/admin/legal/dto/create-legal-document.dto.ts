import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { SUPPORTED_LANGS } from "src/legal/legal.service";

export class CreateLegalDocumentDto {
  @ApiProperty({
    example: "privacy",
    description:
      "URL-friendly идентификатор: lowercase, цифры, дефис. Уникален в паре с lang.",
  })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: "slug must contain only lowercase letters, digits and dashes",
  })
  @MinLength(2)
  @MaxLength(64)
  slug: string;

  @ApiProperty({ example: "ru", enum: SUPPORTED_LANGS })
  @IsString()
  @IsIn(SUPPORTED_LANGS as readonly string[])
  lang: string;

  @ApiProperty({ example: "Политика конфиденциальности" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiProperty({
    example: "# Заголовок\n\nТекст в Markdown...",
    description: "Markdown-контент документа",
  })
  @IsString()
  @MinLength(1)
  content: string;

  @ApiPropertyOptional({
    description: "Сразу опубликовать (по умолчанию false — черновик)",
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
