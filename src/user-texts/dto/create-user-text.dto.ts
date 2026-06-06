import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { Transform } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Prisma, Language, UserTextType } from "@prisma/client";

const MAX_CONTENT_BYTES = 500_000;

export class CreateUserTextDto {
  @ApiProperty({ description: "Название текста" })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title: string;

  @ApiProperty({ enum: Language, default: Language.CHE, description: "Язык текста" })
  @IsEnum(Language)
  language: Language = Language.CHE;

  @ApiProperty({ enum: UserTextType, description: "Тип: своё произведение или чужой текст" })
  @IsEnum(UserTextType)
  type: UserTextType;

  @ApiPropertyOptional({ description: "Автор текста (игнорируется для ORIGINAL — выводится с сервера)" })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  author?: string;

  @ApiPropertyOptional({ description: "Ссылка на источник" })
  @ValidateIf((o) => o.sourceUrl !== undefined && o.sourceUrl !== "")
  @IsUrl({ require_protocol: true })
  @IsOptional()
  sourceUrl?: string;

  @ApiProperty({ description: "Содержимое текста (TipTap JSON, макс. 500 КБ)" })
  @IsObject()
  @Transform(({ value }) => {
    if (typeof value === "object" && value !== null) {
      if (JSON.stringify(value).length > MAX_CONTENT_BYTES) {
        throw new Error(`content exceeds ${MAX_CONTENT_BYTES} bytes`);
      }
    }
    return value;
  })
  content: Prisma.InputJsonValue;
}
