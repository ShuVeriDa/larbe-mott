import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional } from "class-validator";

export class UpdateTokenizationSettingsDto {
  @ApiPropertyOptional({ description: "Авто-токенизация при сохранении текста" })
  @IsBoolean()
  @IsOptional()
  autoTokenize?: boolean;

  @ApiPropertyOptional({ description: "Нормализация к базовой форме" })
  @IsBoolean()
  @IsOptional()
  normalization?: boolean;

  @ApiPropertyOptional({ description: "Морфоанализ по правилам" })
  @IsBoolean()
  @IsOptional()
  morphAnalysis?: boolean;

  @ApiPropertyOptional({ description: "Запросы к внешнему Online API" })
  @IsBoolean()
  @IsOptional()
  onlineDictionaries?: boolean;
}
