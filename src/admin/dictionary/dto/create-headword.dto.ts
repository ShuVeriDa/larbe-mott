import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateHeadwordDto {
  @ApiProperty({ description: "Alternative spelling / headword text", example: "мот" })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  word: string;

  @ApiPropertyOptional({ description: "Mark as primary headword", default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
