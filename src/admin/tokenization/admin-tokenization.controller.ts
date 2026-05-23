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
  Sse,
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
import { map } from "rxjs";
import { PermissionCode } from "@prisma/client";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { User } from "src/user/decorators/user.decorator";
import { AdminTokenizationService } from "./admin-tokenization.service";
import { BulkTokenizationDto } from "./dto/bulk.dto";
import { AdminTokenizationListQueryDto } from "./dto/list-query.dto";
import { RunTokenizationDto } from "./dto/run.dto";
import { ProblematicTokensQueryDto } from "./dto/tokens-query.dto";
import { UpdateTokenizationSettingsDto } from "./dto/update-settings.dto";
import { TokenizationEventsService } from "./tokenization-events.service";

@ApiTags("admin/tokenization")
@ApiBearerAuth()
@Controller("admin/tokenization")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class AdminTokenizationController {
  constructor(
    private readonly service: AdminTokenizationService,
    private readonly events: TokenizationEventsService,
  ) {}

  // ──────────────────────────────────────────────────────────────
  // SSE — realtime events
  // ──────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Sse("events")
  @ApiOperation({
    summary: "SSE stream of tokenization events (admin only)",
    description:
      "Emits events: progress {textId, progress}, status_change {textId, status}, queue_changed {queue}",
  })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  sseEvents() {
    return this.events.stream$.pipe(map((event) => ({ data: event })));
  }

  // ──────────────────────────────────────────────────────────────
  // STATS
  // ──────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get("stats")
  @ApiOperation({
    summary: "Tokenization summary statistics (admin only)",
    description:
      "totalTokens, analyzedCount/Percent, ambiguousCount/Percent, notFoundCount/Percent, textsWithoutProcessing, counts per tab",
  })
  @ApiOkResponse({ description: "Aggregated statistics across all current versions" })
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
    summary: "Token distribution and analysis sources (admin only)",
    description:
      "Data for the donut chart: total, analyzed/ambiguous/notFound + sources (admin/cache/morphology/online)",
  })
  @ApiOkResponse({ description: "Distribution data for the right-hand panel" })
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
    summary: "List texts with tokenization data (admin only)",
    description:
      "Filters: tab (all|issues|notfound|pending), search, level, status. Sort: errors|date|name. Pagination.",
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
    summary: "Processing queue (admin only)",
    description: "Texts with RUNNING status and their progress",
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
    summary: "Global tokenization settings (admin only)",
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
    summary: "Update tokenization settings (admin only)",
    description: "Partial update: autoTokenize, normalization, morphAnalysis, onlineDictionaries",
  })
  @ApiBody({ type: UpdateTokenizationSettingsDto })
  @ApiOkResponse({ description: "Updated settings" })
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
    summary: "Start batch processing (admin only)",
    description:
      "scope: pending — unprocessed texts only; errors — texts with errors; all — full reprocessing",
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
  @ApiOperation({ summary: "Start processing for selected texts (admin only)" })
  @ApiBody({ type: BulkTokenizationDto })
  @ApiOkResponse({ description: "{ started: number, textIds: string[] }" })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async bulkRun(@Body() dto: BulkTokenizationDto, @User("id") userId: string) {
    return this.service.bulkRun(dto, userId);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post("bulk/reset")
  @ApiOperation({ summary: "Reset tokens for selected texts (admin only)" })
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
    summary: "Text tokenization detail (admin only)",
    description: "Version, stats (total/analyzed/ambiguous/notFound + percentages), sources",
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
    summary: "Problematic tokens for a text (admin only)",
    description: "NOT_FOUND and AMBIGUOUS tokens of the current version. Filter by status, paginated.",
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
    summary: "Start (re-)processing of a single text (admin only)",
    description: "Starts tokenization in the background. Returns immediately.",
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
    summary: "Cancel text processing (admin only)",
    description: "Sets status to IDLE. Actual stop depends on the processor implementation.",
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
    summary: "Reset all tokens for a text (admin only)",
    description: "Deletes all TextProcessingVersion records for the text (and tokens via cascade). Status → IDLE.",
  })
  @ApiParam({ name: "textId", description: "Text UUID" })
  @ApiOkResponse({ description: "{ textId, reset: true }" })
  @ApiNotFoundResponse({ description: "Text not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async resetTokens(@Param("textId") textId: string) {
    return this.service.resetTokens(textId);
  }
}
