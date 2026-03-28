import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

export class UpdateDeckSettingsDto {
  @ApiPropertyOptional({ description: "Enable or disable the deck learning method" })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({
    description: "How many words to suggest per day",
    enum: [3, 5, 10],
    example: 5,
  })
  @IsOptional()
  @IsInt()
  @IsIn([3, 5, 10])
  dailyWordCount?: number;

  @ApiPropertyOptional({
    description: "Maximum number of cards per deck",
    minimum: 10,
    maximum: 500,
    example: 90,
  })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(500)
  deckMaxSize?: number;
}
