import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { PermissionCode } from "@prisma/client";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { User } from "src/user/decorators/user.decorator";
import { AdminTokenizationService } from "./admin-tokenization.service";
import { BulkTokenizationDto } from "./dto/bulk.dto";
import { AdminTokenizationListQueryDto } from "./dto/list-query.dto";
import { RunTokenizationDto } from "./dto/run.dto";
import { ProblematicTokensQueryDto } from "./dto/tokens-query.dto";
import { UpdateTokenizationSettingsDto } from "./dto/update-settings.dto";

@ApiTags("admin/tokenization")
@ApiBearerAuth()
@Controller("admin/tokenization")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class AdminTokenizationController {
  constructor(private readonly service: AdminTokenizationService) {}

  // ──────────────────────────────────────────────────────────────
  // STATS
  // ──────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get("stats")
  @ApiOperation({
    summary: "Сводная статистика токенизации (admin only)",
    description:
      "totalTokens, analyzedCount/Percent, ambiguousCount/Percent, notFoundCount/Percent, textsWithoutProcessing, counts per tab",
  })
  @ApiOkResponse({ description: "Агрегированная статистика по всем текущим версиям" })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async getStats() {
    return this.service.getStats();
  }

  // ──────────────────────────────────────────────────────────────
  // DISTRIBUTION
  // ──────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get("distribution")
  @ApiOperation({
    summary: "Распределение токенов + источники анализа (admin only)",
    description:
      "Данные для donut-графика: total, analyzed/ambiguous/notFound + sources (admin/cache/morphology/online)",
  })
  @ApiOkResponse({ description: "Распределение для правой панели" })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async getDistribution() {
    return this.service.getDistribution();
  }

  // ──────────────────────────────────────────────────────────────
  // LIST TEXTS
  // ──────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get("texts")
  @ApiOperation({
    summary: "Список текстов с данными токенизации (admin only)",
    description:
      "Фильтры: tab (all|issues|notfound|pending), search, level, status. Сортировка: errors|date|name. Пагинация.",
  })
  @ApiOkResponse({
    description:
      "{ data: [{ id, title, level, pagesCount, processingStatus, processingProgress, tokenizationVersion, totalTokens, analyzedCount, notFoundCount, ambiguousCount, analyzePercent, processedAt }], total, page, limit }",
  })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async getTexts(@Query() query: AdminTokenizationListQueryDto) {
    return this.service.getTexts(query);
  }

  // ──────────────────────────────────────────────────────────────
  // QUEUE
  // ──────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get("queue")
  @ApiOperation({
    summary: "Очередь обработки (admin only)",
    description: "Тексты со статусом RUNNING и их прогресс",
  })
  @ApiOkResponse({ description: "{ items: [{ textId, title, progress, queueStatus }], count }" })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async getQueue() {
    return this.service.getQueue();
  }

  // ──────────────────────────────────────────────────────────────
  // SETTINGS
  // ──────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get("settings")
  @ApiOperation({
    summary: "Глобальные настройки токенизации (admin only)",
    description: "autoTokenize, normalization, morphAnalysis, onlineDictionaries",
  })
  @ApiOkResponse({ description: "TokenizationSettings singleton" })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async getSettings() {
    return this.service.getSettings();
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Patch("settings")
  @ApiOperation({
    summary: "Обновить настройки токенизации (admin only)",
    description: "Частичное обновление: autoTokenize, normalization, morphAnalysis, onlineDictionaries",
  })
  @ApiBody({ type: UpdateTokenizationSettingsDto })
  @ApiOkResponse({ description: "Обновлённые настройки" })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async updateSettings(@Body() dto: UpdateTokenizationSettingsDto) {
    return this.service.updateSettings(dto);
  }

  // ──────────────────────────────────────────────────────────────
  // RUN (global scope)
  // ──────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post("run")
  @ApiOperation({
    summary: "Запустить пакетную обработку (admin only)",
    description:
      "scope: pending — только необработанные; errors — тексты с ошибками; all — полная переобработка",
  })
  @ApiBody({ type: RunTokenizationDto })
  @ApiOkResponse({ description: "{ started: number, textIds: string[] }" })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async runProcessing(@Body() dto: RunTokenizationDto, @User("id") userId: string) {
    return this.service.runProcessing(dto, userId);
  }

  // ──────────────────────────────────────────────────────────────
  // BULK ACTIONS  (must be before /:textId routes)
  // ──────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post("bulk/run")
  @ApiOperation({ summary: "Запустить обработку для выбранных текстов (admin only)" })
  @ApiBody({ type: BulkTokenizationDto })
  @ApiOkResponse({ description: "{ started: number, textIds: string[] }" })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async bulkRun(@Body() dto: BulkTokenizationDto, @User("id") userId: string) {
    return this.service.bulkRun(dto, userId);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post("bulk/reset")
  @ApiOperation({ summary: "Сбросить токены для выбранных текстов (admin only)" })
  @ApiBody({ type: BulkTokenizationDto })
  @ApiOkResponse({ description: "{ reset: number }" })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async bulkReset(@Body() dto: BulkTokenizationDto) {
    return this.service.bulkReset(dto);
  }

  // ──────────────────────────────────────────────────────────────
  // SINGLE TEXT
  // ──────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get("texts/:textId")
  @ApiOperation({
    summary: "Детализация токенизации текста (admin only)",
    description: "Версия, stats (total/analyzed/ambiguous/notFound + проценты), sources",
  })
  @ApiParam({ name: "textId", description: "Text UUID" })
  @ApiOkResponse({
    description: "{ id, title, level, processingStatus, version, tokenStats, sources }",
  })
  @ApiNotFoundResponse({ description: "Text not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async getTextDetail(@Param("textId") textId: string) {
    return this.service.getTextDetail(textId);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get("texts/:textId/tokens")
  @ApiOperation({
    summary: "Проблемные токены текста (admin only)",
    description: "NOT_FOUND и AMBIGUOUS токены текущей версии. Фильтр по status, пагинация.",
  })
  @ApiParam({ name: "textId", description: "Text UUID" })
  @ApiOkResponse({
    description:
      "{ data: [{ id, original, normalized, status, source, pageNumber, position }], total, page, limit }",
  })
  @ApiNotFoundResponse({ description: "Text not found or no current version." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async getProblematicTokens(
    @Param("textId") textId: string,
    @Query() query: ProblematicTokensQueryDto,
  ) {
    return this.service.getProblematicTokens(textId, query);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post("texts/:textId/run")
  @ApiOperation({
    summary: "Запустить (пере-)обработку одного текста (admin only)",
    description: "Запускает токенизацию в фоне. Возвращает сразу.",
  })
  @ApiParam({ name: "textId", description: "Text UUID" })
  @ApiOkResponse({ description: "{ textId, started: true }" })
  @ApiNotFoundResponse({ description: "Text not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async runForText(@Param("textId") textId: string, @User("id") userId: string) {
    return this.service.runProcessingForText(textId, userId);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Delete("texts/:textId/run")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Отменить обработку текста (admin only)",
    description: "Устанавливает статус IDLE. Фактический стоп зависит от реализации процессора.",
  })
  @ApiParam({ name: "textId", description: "Text UUID" })
  @ApiOkResponse({ description: "{ textId, cancelled: true }" })
  @ApiNotFoundResponse({ description: "Text not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async cancelProcessing(@Param("textId") textId: string) {
    return this.service.cancelProcessing(textId);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Delete("texts/:textId/tokens")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Сбросить все токены текста (admin only)",
    description: "Удаляет все TextProcessingVersion текста (и токены каскадно). Статус → IDLE.",
  })
  @ApiParam({ name: "textId", description: "Text UUID" })
  @ApiOkResponse({ description: "{ textId, reset: true }" })
  @ApiNotFoundResponse({ description: "Text not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async resetTokens(@Param("textId") textId: string) {
    return this.service.resetTokens(textId);
  }
}
