// update-folder.dto.ts
import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class UpdateDictionaryFolderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name?: string;

  @ApiPropertyOptional({
    description: "Sort order (lower = first)",
  })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
