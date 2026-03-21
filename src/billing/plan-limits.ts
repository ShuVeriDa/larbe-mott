import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";

export class PlanLimits {
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
}
