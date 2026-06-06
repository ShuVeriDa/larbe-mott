import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { Transform, Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  Prisma,
  SubmissionLicenseType,
  SubmissionType,
  TextSubmissionStatus,
} from "@prisma/client";

const MAX_CONTENT_RICH_BYTES = 500_000;
const CURRENT_YEAR = new Date().getFullYear();

export class CreateTextSubmissionPageDto {
  @ApiProperty({ description: "Номер страницы (начиная с 1)", example: 1 })
  @IsInt()
  @Min(1)
  pageNumber: number;

  @ApiPropertyOptional({ description: "Заголовок страницы (необязательно)", maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @ApiProperty({ description: "Содержимое страницы в формате TipTap JSON" })
  @IsObject()
  @IsNotEmpty()
  contentRich: Prisma.InputJsonValue;
}

export class CreateTextSubmissionDto {
  @ApiProperty({ description: "Название текста или книги" })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiProperty({ description: "Язык текста (che, ru, en, other)" })
  @IsString()
  @MinLength(1)
  language: string;

  @ApiPropertyOptional({ description: "Автор текста (игнорируется для ORIGINAL — выводится с сервера)" })
  @IsOptional()
  @IsString()
  author?: string;

  @ApiPropertyOptional({ description: "Ссылка на источник" })
  @ValidateIf((o) => o.sourceUrl !== undefined && o.sourceUrl !== "")
  @IsUrl({ require_protocol: true })
  @IsOptional()
  sourceUrl?: string;

  @ApiPropertyOptional({ description: "Текст (plain), максимум 100 000 символов" })
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  content?: string;

  @ApiPropertyOptional({ description: "Комментарий автора" })
  @IsOptional()
  @IsString()
  comment?: string;

  // --- New fields (draft/publication flow) ---

  @ApiPropertyOptional({ enum: SubmissionType, default: SubmissionType.EXTERNAL })
  @IsOptional()
  @IsEnum(SubmissionType)
  submissionType?: SubmissionType;

  @ApiPropertyOptional({
    enum: SubmissionLicenseType,
    description: "Тип лицензии (только для EXTERNAL)",
  })
  @IsOptional()
  @IsEnum(SubmissionLicenseType)
  licenseType?: SubmissionLicenseType;

  @ApiPropertyOptional({ description: "Год публикации (только для EXTERNAL)", minimum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(CURRENT_YEAR)
  publicationYear?: number;

  @ApiPropertyOptional({ description: "Содержимое в формате TipTap JSON (макс. 500 КБ)" })
  @IsOptional()
  @IsObject()
  @Transform(({ value }) => {
    if (value !== undefined && value !== null) {
      if (JSON.stringify(value).length > MAX_CONTENT_RICH_BYTES) {
        throw new Error(`contentRich exceeds ${MAX_CONTENT_RICH_BYTES} bytes`);
      }
    }
    return value;
  })
  contentRich?: Prisma.InputJsonValue;

  @ApiPropertyOptional({
    enum: TextSubmissionStatus,
    description: "Статус при создании (DRAFT по умолчанию для нового flow)",
  })
  @IsOptional()
  @IsEnum(TextSubmissionStatus)
  status?: TextSubmissionStatus;

  @ApiPropertyOptional({
    type: [CreateTextSubmissionPageDto],
    description: "Страницы текста. Если указаны — заменяют contentRich.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTextSubmissionPageDto)
  pages?: CreateTextSubmissionPageDto[];
}
