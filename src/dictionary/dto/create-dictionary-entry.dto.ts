import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateDictionaryEntryDto {
  @ApiPropertyOptional({
    description:
      "Token ID when adding from text click. If set, word/translation are resolved server-side.",
  })
  @IsOptional()
  @IsUUID()
  tokenId?: string;

  @ApiPropertyOptional({
    description: "Word (required if tokenId is not provided).",
    example: "машина",
  })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "Word must not be empty" })
  @MaxLength(200)
  word?: string;

  @ApiPropertyOptional({
    description: "Translation (required if tokenId is not provided).",
    example: "car",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  translation?: string;

  @ApiPropertyOptional({
    description: "Folder ID to put the entry into",
  })
  @IsOptional()
  @IsUUID()
  folderId?: string;
}
