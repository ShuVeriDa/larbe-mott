import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsHexColor, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateDictionaryFolderDto {
  @ApiProperty({
    description: "Folder name",
    example: "Транспорт",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name: string;

  @ApiPropertyOptional({
    description: "Folder description",
    example: "Слова на тему транспорта",
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  description?: string;

  @ApiPropertyOptional({
    description: "Folder color (hex)",
    example: "#2254d3",
  })
  @IsOptional()
  @IsHexColor()
  color?: string;
}
