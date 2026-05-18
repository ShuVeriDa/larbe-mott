import {
  BadRequestException,
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
  Res,
  Sse,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { Observable } from "rxjs";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
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
import { diskStorage } from "multer";
import { extname, join } from "path";
import * as fs from "fs";
import { CreateTextDto } from "src/admin/text/dto/create.dto";
import { BulkTextIdsDto } from "src/admin/text/dto/bulk.dto";
import { BulkImportTextsDto } from "src/admin/text/dto/bulk-import.dto";
import { AdminListTextsQueryDto } from "src/admin/text/dto/list-query.dto";
import { ProcessTextDto } from "src/admin/text/dto/process.dto";
import { PatchTextDto } from "src/admin/text/dto/update.dto";
import { VersionsQueryDto } from "src/admin/text/dto/versions-query.dto";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { User } from "src/user/decorators/user.decorator";
import { AdminTextService } from "./admin-text.service";

@ApiTags("admin/texts")
@ApiBearerAuth()
@Controller("admin/texts")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class AdminTextsController {
  constructor(private readonly adminTextService: AdminTextService) {}

  // ──────────────────────────────────────────────────────────────
  // STATS
  // ──────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get("stats")
  @ApiOperation({ summary: "Text library statistics (admin only)" })
  @ApiOkResponse({
    description:
      "totalCount, totalGrowthPerMonth, publishedCount, publishedPercent, draftCount, archivedCount, processingCount, errorCount",
  })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async getStats() {
    return this.adminTextService.getTextStats();
  }

  // ──────────────────────────────────────────────────────────────
  // LIST
  // ──────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get()
  @ApiOperation({ summary: "List texts with filtering, sorting, pagination (admin only)" })
  @ApiOkResponse({ description: "Paginated list of texts with tokenCount, tags, readCount." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async getTexts(@Query() query: AdminListTextsQueryDto) {
    return this.adminTextService.getTextsForAdmin(query);
  }

  // ──────────────────────────────────────────────────────────────
  // CREATE
  // ──────────────────────────────────────────────────────────────

  @HttpCode(201)
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post()
  @ApiOperation({ summary: "Create a new text (admin only)" })
  @ApiBody({ type: CreateTextDto })
  @ApiCreatedResponse({ description: "Text created successfully." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async addNewText(@Body() dto: CreateTextDto, @User("id") userId: string) {
    return this.adminTextService.addNewText(dto, userId);
  }

  // ──────────────────────────────────────────────────────────────
  // BULK ACTIONS  (must be before /:id routes)
  // ──────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post("bulk/publish")
  @ApiOperation({ summary: "Bulk publish texts (admin only)" })
  @ApiBody({ type: BulkTextIdsDto })
  @ApiOkResponse({ description: "{ updated: number }" })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async bulkPublish(@Body() dto: BulkTextIdsDto) {
    return this.adminTextService.bulkPublish(dto.ids);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post("bulk/unpublish")
  @ApiOperation({ summary: "Bulk unpublish texts (admin only)" })
  @ApiBody({ type: BulkTextIdsDto })
  @ApiOkResponse({ description: "{ updated: number }" })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async bulkUnpublish(@Body() dto: BulkTextIdsDto) {
    return this.adminTextService.bulkUnpublish(dto.ids);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post("bulk/tokenize")
  @ApiOperation({ summary: "Bulk trigger tokenization (admin only)" })
  @ApiBody({ type: BulkTextIdsDto })
  @ApiOkResponse({ description: "{ started: number }" })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async bulkTokenize(@Body() dto: BulkTextIdsDto) {
    return this.adminTextService.bulkTokenize(dto.ids);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post("bulk/delete")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Bulk delete texts (admin only)" })
  @ApiBody({ type: BulkTextIdsDto })
  @ApiOkResponse({ description: "{ deleted: number }" })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async bulkDelete(@Body() dto: BulkTextIdsDto) {
    return this.adminTextService.bulkDelete(dto.ids);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get("export")
  @ApiOperation({ summary: "Export all texts (with filters) as JSON or CSV (admin only)" })
  @ApiOkResponse({ description: "Texts export in JSON array or CSV string." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async exportTexts(
    @Query() query: AdminListTextsQueryDto,
    @Query("format") format: "json" | "csv" = "json",
    @Query("ids") rawIds: string | undefined,
    @Res() res: Response,
  ) {
    const ids = rawIds ? rawIds.split(",").filter(Boolean) : undefined;
    const payload = await this.adminTextService.exportTexts(query, format === "csv" ? "csv" : "json", ids);
    const ts = new Date().toISOString().slice(0, 10);
    if (format === "csv") {
      const filename = `texts-export-${ts}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(payload);
    } else {
      const filename = `texts-export-${ts}.json`;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(JSON.stringify(payload, null, 2));
    }
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post("bulk-import")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Bulk import texts from a JSON payload (admin only)",
    description:
      "Each item is validated against CreateTextDto and created sequentially. Partial success is supported: failures are reported per-item and do not block the rest. Tokenization is queued in background per item if autoTokenize is not set to false.",
  })
  @ApiBody({ type: BulkImportTextsDto })
  @ApiOkResponse({
    description:
      "{ total, created, failed, items: [{ index, status: 'ok'|'error', textId?, title?, error? }] }",
  })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async bulkImport(
    @Body() dto: BulkImportTextsDto,
    @User("id") userId: string,
  ) {
    return this.adminTextService.bulkImport(dto.items, userId);
  }

  // ──────────────────────────────────────────────────────────────
  // VERSIONS (must be before /:id to avoid param conflicts)
  // ──────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get(":id/versions")
  @ApiOperation({ summary: "Get processing version history for a text (admin only)" })
  @ApiParam({ name: "id", description: "Text UUID" })
  @ApiOkResponse({
    description:
      "{ textId, total, successCount, errorCount, data: [ version with tokenCount, pageCount, logs summary ] }. Counters always reflect the full history; ?status filters only the data array.",
  })
  @ApiNotFoundResponse({ description: "Text not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async getVersions(
    @Param("id") textId: string,
    @Query() query: VersionsQueryDto,
  ) {
    return this.adminTextService.getTextVersions(textId, query.status);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get(":id/versions/:versionId")
  @ApiOperation({ summary: "Get full details of a processing version (admin only)" })
  @ApiParam({ name: "id", description: "Text UUID" })
  @ApiParam({ name: "versionId", description: "Version UUID" })
  @ApiOkResponse({
    description: "Version metadata, per-page stats, and execution log.",
  })
  @ApiNotFoundResponse({ description: "Text or version not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async getVersionDetail(
    @Param("id") textId: string,
    @Param("versionId") versionId: string,
  ) {
    return this.adminTextService.getVersionDetail(textId, versionId);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post(":id/versions/:versionId/restore")
  @ApiOperation({ summary: "Restore a completed version as the current active version (admin only)" })
  @ApiParam({ name: "id", description: "Text UUID" })
  @ApiParam({ name: "versionId", description: "Version UUID" })
  @ApiOkResponse({ description: "{ versionId, restored: true }" })
  @ApiNotFoundResponse({ description: "Text or version not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async restoreVersion(
    @Param("id") textId: string,
    @Param("versionId") versionId: string,
  ) {
    return this.adminTextService.restoreVersion(textId, versionId);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post(":id/versions/:versionId/retry")
  @ApiOperation({
    summary: "Retry a previous version (re-runs processing with the same settings)",
    description:
      "Useful for failed (ERROR) versions. Creates a new version reusing useNormalization / useMorphAnalysis from the source version.",
  })
  @ApiParam({ name: "id", description: "Text UUID" })
  @ApiParam({ name: "versionId", description: "Version UUID to copy settings from" })
  @ApiOkResponse({ description: "{ textId, started: true }" })
  @ApiNotFoundResponse({ description: "Text or version not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async retryVersion(
    @Param("id") textId: string,
    @Param("versionId") versionId: string,
    @User("id") userId: string,
  ) {
    return this.adminTextService.retryVersion(textId, versionId, userId);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get(":id/versions/:versionId/download")
  @ApiOperation({ summary: "Download version data as JSON (admin only)" })
  @ApiParam({ name: "id", description: "Text UUID" })
  @ApiParam({ name: "versionId", description: "Version UUID" })
  @ApiOkResponse({ description: "Full version export: metadata, pages, tokens." })
  @ApiNotFoundResponse({ description: "Text or version not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async downloadVersion(
    @Param("id") textId: string,
    @Param("versionId") versionId: string,
    @Res() res: Response,
  ) {
    const payload = await this.adminTextService.downloadVersion(textId, versionId);
    const filename = `text-${textId}-v${payload.version}.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(JSON.stringify(payload, null, 2));
  }

  // ──────────────────────────────────────────────────────────────
  // SINGLE TEXT ACTIONS
  // ──────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get(":id/export")
  @ApiOperation({ summary: "Export a single text as JSON or CSV (admin only)" })
  @ApiParam({ name: "id", description: "Text UUID" })
  @ApiOkResponse({ description: "Text export with metadata and pages." })
  @ApiNotFoundResponse({ description: "Text not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async exportTextById(
    @Param("id") textId: string,
    @Query("format") format: "json" | "csv" = "json",
    @Res() res: Response,
  ) {
    const payload = await this.adminTextService.exportTextById(textId, format === "csv" ? "csv" : "json");
    const ts = new Date().toISOString().slice(0, 10);
    if (format === "csv") {
      const filename = `text-${textId}-${ts}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(payload);
    } else {
      const filename = `text-${textId}-${ts}.json`;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(JSON.stringify(payload, null, 2));
    }
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get(":id/unknown-words")
  @ApiOperation({ summary: "Get unknown words from the latest processing version (admin only)" })
  @ApiParam({ name: "id", description: "Text UUID" })
  @ApiOkResponse({ description: "{ versionId, version, items: [{ word, count }], total }" })
  @ApiNotFoundResponse({ description: "Text not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async getUnknownWords(@Param("id") textId: string) {
    return this.adminTextService.getUnknownWordsForText(textId);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post(":id/process")
  @ApiOperation({
    summary: "Start a new processing run with configurable settings (admin only)",
    description:
      "Creates a new version in the background. On completion it becomes the current active version.",
  })
  @ApiParam({ name: "id", description: "Text UUID" })
  @ApiBody({ type: ProcessTextDto })
  @ApiOkResponse({ description: "{ textId, started: true }" })
  @ApiNotFoundResponse({ description: "Text not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async processText(
    @Param("id") textId: string,
    @Body() dto: ProcessTextDto,
    @User("id") userId: string,
  ) {
    return this.adminTextService.startProcessing(textId, dto, userId);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Sse(":id/process/stream")
  @ApiOperation({
    summary: "Server-Sent Events stream of the latest processing version status",
    description:
      "Emits one event every ~1.5s with { id, version, status, progress, errorMessage, durationMs, isCurrent, updatedAt }. Stream completes when status is COMPLETED or ERROR. If there is no version yet, emits a single { status: 'NONE' } event and stays open polling.",
  })
  @ApiParam({ name: "id", description: "Text UUID" })
  streamProgress(@Param("id") textId: string): Observable<{ data: unknown }> {
    return new Observable<{ data: unknown }>((subscriber) => {
      let stopped = false;
      const tick = async () => {
        if (stopped) return;
        try {
          const snap = await this.adminTextService.getLatestVersionStatus(textId);
          const payload = snap ?? { status: "NONE" as const };
          subscriber.next({ data: payload });
          if (snap && (snap.status === "COMPLETED" || snap.status === "ERROR")) {
            subscriber.complete();
            return;
          }
        } catch (err) {
          subscriber.error(err);
          return;
        }
        if (!stopped) setTimeout(tick, 1500);
      };
      void tick();
      return () => {
        stopped = true;
      };
    });
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post(":id/publish")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Publish a single text (admin only)",
    description: "Sets publishedAt=now, archivedAt=null. Semantic alias for PATCH { status: 'published' }.",
  })
  @ApiParam({ name: "id", description: "Text UUID" })
  @ApiOkResponse({ description: "{ textId, published: true }" })
  @ApiNotFoundResponse({ description: "Text not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async publishOne(@Param("id") textId: string) {
    return this.adminTextService.publishOne(textId);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post(":id/unpublish")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Unpublish a single text (admin only)",
    description: "Sets publishedAt=null. Semantic alias for PATCH { status: 'draft' }.",
  })
  @ApiParam({ name: "id", description: "Text UUID" })
  @ApiOkResponse({ description: "{ textId, published: false }" })
  @ApiNotFoundResponse({ description: "Text not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async unpublishOne(@Param("id") textId: string) {
    return this.adminTextService.unpublishOne(textId);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post(":id/clear-cache")
  @ApiOperation({ summary: "Clear dictionary cache for words in this text (admin only)" })
  @ApiParam({ name: "id", description: "Text UUID" })
  @ApiOkResponse({ description: "{ deleted: number }" })
  async clearDictionaryCache(@Param("id") textId: string) {
    return this.adminTextService.clearDictionaryCache(textId);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post(":id/tokenize")
  @ApiOperation({ summary: "Trigger (re-)tokenization for a text (admin only)" })
  @ApiParam({ name: "id", description: "Text UUID" })
  @ApiOkResponse({ description: "{ textId, started: true }. Processing runs in background." })
  @ApiNotFoundResponse({ description: "Text not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async retokenize(@Param("id") textId: string, @User("id") userId: string) {
    return this.adminTextService.retokenizeText(textId, userId);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post(":id/cover")
  @ApiOperation({ summary: "Upload cover image for a text (admin only)" })
  @ApiParam({ name: "id", description: "Text UUID" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: { file: { type: "string", format: "binary" } },
    },
  })
  @ApiOkResponse({ description: "{ imageUrl: string }" })
  @ApiNotFoundResponse({ description: "Text not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(process.cwd(), "uploads", "covers");
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `${(req.params as { id: string }).id}-${Date.now()}${ext}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/webp"];
        if (!allowed.includes(file.mimetype)) {
          return cb(new BadRequestException("Only JPG, PNG, WebP files are allowed"), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  async uploadCover(
    @Param("id") textId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("File is required");
    return this.adminTextService.uploadCover(textId, file);
  }

  // ──────────────────────────────────────────────────────────────
  // GET ONE / PATCH / DELETE
  // ──────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get(":id")
  @ApiOperation({ summary: "Get a single text with pages and tags (admin only)" })
  @ApiParam({ name: "id", description: "Text UUID" })
  @ApiOkResponse({ description: "Text with pages, tags, tokenCount, latestVersion." })
  @ApiNotFoundResponse({ description: "Text not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async getTextById(@Param("id") textId: string) {
    return this.adminTextService.getTextById(textId);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Patch(":id")
  @ApiOperation({ summary: "Partially update a text (admin only)" })
  @ApiParam({ name: "id", description: "Text UUID" })
  @ApiBody({ type: PatchTextDto })
  @ApiOkResponse({ description: "Updated text." })
  @ApiNotFoundResponse({ description: "Text not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async patchText(
    @Param("id") textId: string,
    @Body() dto: PatchTextDto,
    @User("id") userId: string,
  ) {
    return this.adminTextService.patchText(textId, dto, userId);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a text (admin only)" })
  @ApiParam({ name: "id", description: "Text UUID" })
  @ApiNoContentResponse({ description: "Text deleted." })
  @ApiNotFoundResponse({ description: "Text not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async deleteText(@Param("id") textId: string) {
    await this.adminTextService.deleteText(textId);
  }
}
