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
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
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
import { AdminListTextsQueryDto } from "src/admin/text/dto/list-query.dto";
import { ProcessTextDto } from "src/admin/text/dto/process.dto";
import { PatchTextDto } from "src/admin/text/dto/update.dto";
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

  // ──────────────────────────────────────────────────────────────
  // VERSIONS (must be before /:id to avoid param conflicts)
  // ──────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get(":id/versions")
  @ApiOperation({ summary: "Get processing version history for a text (admin only)" })
  @ApiParam({ name: "id", description: "Text UUID" })
  @ApiOkResponse({
    description:
      "{ textId, total, successCount, errorCount, data: [ version with tokenCount, pageCount, logs summary ] }",
  })
  @ApiNotFoundResponse({ description: "Text not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async getVersions(@Param("id") textId: string) {
    return this.adminTextService.getTextVersions(textId);
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
  ) {
    return this.adminTextService.downloadVersion(textId, versionId);
  }

  // ──────────────────────────────────────────────────────────────
  // SINGLE TEXT ACTIONS
  // ──────────────────────────────────────────────────────────────

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
