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
      "URL-friendly identifier: lowercase letters, digits, hyphen. Unique together with lang.",
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

  @ApiProperty({ example: "Privacy Policy" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiProperty({
    example: "# Heading\n\nText in Markdown...",
    description: "Markdown content of the document",
  })
  @IsString()
  @MinLength(1)
  content: string;

  @ApiPropertyOptional({
    description: "Publish immediately (default false — draft)",
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
