import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

export class CreateSenseDto {
  @ApiProperty({ description: "Translation / definition", example: "язык (орган)" })
  @IsString()
  @MaxLength(2000)
  definition: string;

  @ApiPropertyOptional({ description: "Optional notes for this sense" })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ description: "Display order (0-based)", default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order?: number = 0;
}
