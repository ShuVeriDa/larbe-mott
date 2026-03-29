import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, Min } from "class-validator";

export class PlanLimits {
  // ─── Числовые лимиты (-1 = безлимит) ─────────────────────────────────────────

  @ApiPropertyOptional({ description: "Переводов в день (-1 = безлимит)", example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1)
  translationsPerDay?: number;

  @ApiPropertyOptional({ description: "Слов в личном словаре (-1 = безлимит)", example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1)
  wordsInDictionary?: number;

  @ApiPropertyOptional({ description: "Доступных текстов (-1 = безлимит)", example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1)
  availableTexts?: number;

  @ApiPropertyOptional({ description: "Дней хранения статистики (-1 = безлимит)", example: -1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1)
  statisticsDays?: number;

  // ─── Чтение ──────────────────────────────────────────────────────────────────

  @ApiProperty({ description: "Чтение текстов", example: true })
  @IsBoolean()
  readTexts: boolean;

  @ApiProperty({ description: "Перевод слов по клику", example: true })
  @IsBoolean()
  wordTranslation: boolean;

  @ApiProperty({
    description: "Грамматика и базовая форма слова (анализ токена)",
    example: true,
  })
  @IsBoolean()
  tokenAnalysis: boolean;

  // ─── Словарь ─────────────────────────────────────────────────────────────────

  @ApiProperty({
    description: "Личный словарь (добавление слов)",
    example: true,
  })
  @IsBoolean()
  personalDictionary: boolean;

  @ApiProperty({ description: "Папки в личном словаре", example: false })
  @IsBoolean()
  dictionaryFolders: boolean;

  // ─── Прогресс ────────────────────────────────────────────────────────────────

  @ApiProperty({ description: "Прогресс чтения текстов (%)", example: true })
  @IsBoolean()
  textProgress: boolean;

  @ApiProperty({
    description: "Интервальные повторения (SM-2)",
    example: false,
  })
  @IsBoolean()
  spaceRepetition: boolean;

  @ApiProperty({
    description: "Деки зазубривания (флэш-карточки)",
    example: false,
  })
  @IsBoolean()
  hasFlashcards: boolean;

  @ApiProperty({
    description: "Контексты слов — фрагменты текстов, где встречалось слово",
    example: false,
  })
  @IsBoolean()
  wordContexts: boolean;

  // ─── Аналитика ───────────────────────────────────────────────────────────────

  @ApiProperty({
    description: "Личная аналитика и статистика обучения",
    example: false,
  })
  @IsBoolean()
  analytics: boolean;

  @ApiProperty({
    description: "Расширенная аналитика",
    example: false,
  })
  @IsBoolean()
  hasAdvancedAnalytics: boolean;

  // ─── Поддержка ───────────────────────────────────────────────────────────────

  @ApiProperty({
    description: "Приоритетная поддержка",
    example: false,
  })
  @IsBoolean()
  hasPrioritySupport: boolean;
}
