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
  Res,
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
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { PermissionCode } from "@prisma/client";
import type { Response } from "express";
import { BulkDeleteDto } from "src/admin/dictionary/dto/bulk-delete.dto";
import { CreateEntryDto } from "src/admin/dictionary/dto/create-entry.dto";
import { CreateExampleDto } from "src/admin/dictionary/dto/create-example.dto";
import { CreateHeadwordDto } from "src/admin/dictionary/dto/create-headword.dto";
import { CreateMorphFormDto } from "src/admin/dictionary/dto/create-morph-form.dto";
import { CreateSenseDto } from "src/admin/dictionary/dto/create-sense.dto";
import { DictionaryListQueryDto } from "src/admin/dictionary/dto/list-query.dto";
import { PatchEntryDto } from "src/admin/dictionary/dto/update-entry.dto";
import { UpdateExampleDto } from "src/admin/dictionary/dto/update-example.dto";
import { UpdateMorphFormDto } from "src/admin/dictionary/dto/update-morph-form.dto";
import { UpdateSenseDto } from "src/admin/dictionary/dto/update-sense.dto";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { DictionaryService } from "src/markup-engine/dictionary/dictionary.service";
import { User } from "src/user/decorators/user.decorator";

@ApiTags("admin/dictionary")
@ApiBearerAuth()
@Controller("admin/dictionary")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class AdminDictionaryController {
  constructor(private dictionaryService: DictionaryService) {}

  // ─────────────────────────────────────────────────────
  // STATS
  // ─────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Get("stats")
  @ApiOperation({
    summary: "Dictionary stats (admin only)",
    description:
      "Returns total entries, lemmas, senses, morph forms, entries without senses, and unknown words count.",
  })
  @ApiOkResponse({
    description:
      "{ totalEntries, totalLemmas, totalSenses, totalMorphForms, entriesWithoutSenses, unknownWordsCount }",
  })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  getStats() {
    return this.dictionaryService.getStats();
  }

  // ─────────────────────────────────────────────────────
  // LIST
  // ─────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Get()
  @ApiOperation({
    summary: "List dictionary entries (admin only)",
    description:
      "Search and paginate admin dictionary. Supports filtering by pos, level, tab (all|no_senses|no_examples|no_forms) and sorting.",
  })
  @ApiOkResponse({
    description: "{ items[], total, page, limit, tabCounts }",
  })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  list(@Query() query: DictionaryListQueryDto) {
    return this.dictionaryService.getListForAdmin({
      q: query.q,
      language: query.language,
      pos: query.pos,
      level: query.level,
      sort: query.sort,
      tab: query.tab,
      page: query.page,
      limit: query.limit,
    });
  }

  // ─────────────────────────────────────────────────────
  // EXPORT
  // ─────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Get("export")
  @ApiOperation({
    summary: "Export dictionary entries as JSON (admin only)",
    description: "Pass optional ids[] to export specific entries; omit for full export.",
  })
  @ApiQuery({
    name: "ids",
    required: false,
    isArray: true,
    type: String,
    description: "Lemma UUIDs to export (omit for all)",
  })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async export(
    @Query("ids") ids: string | string[] | undefined,
    @Res() res: Response,
  ) {
    const idList = ids ? (Array.isArray(ids) ? ids : [ids]) : undefined;
    const data = await this.dictionaryService.exportEntries(idList);
    res
      .setHeader("Content-Type", "application/json")
      .setHeader(
        "Content-Disposition",
        `attachment; filename="dictionary-export-${Date.now()}.json"`,
      )
      .json(data);
  }

  // ─────────────────────────────────────────────────────
  // GET CARD
  // ─────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Get(":id")
  @ApiOperation({
    summary: "Get dictionary entry card by lemma id (admin only)",
    description: "Returns lemma, translation, notes, senses with examples, and forms.",
  })
  @ApiParam({ name: "id", description: "Lemma ID (UUID)" })
  @ApiOkResponse({
    description:
      "Entry card: id, baseForm, normalized, language, partOfSpeech, level, frequency, createdAt, translation, notes, entryId, senses[], forms[]",
  })
  @ApiNotFoundResponse({ description: "Entry not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  getCard(@Param("id") lemmaId: string) {
    return this.dictionaryService.getCardForAdmin(lemmaId);
  }

  // ─────────────────────────────────────────────────────
  // CREATE
  // ─────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Post()
  @ApiOperation({
    summary: "Create dictionary entry (admin only)",
    description:
      "Creates a new dictionary entry: word, normalized form, language, translation, optional part of speech, level, notes, and forms.",
  })
  @ApiBody({ type: CreateEntryDto })
  @ApiCreatedResponse({ description: "Dictionary entry created successfully." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  create(@Body() dto: CreateEntryDto, @User("id") userId: string) {
    return this.dictionaryService.createEntry(dto, userId);
  }

  // ─────────────────────────────────────────────────────
  // UPDATE
  // ─────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Patch(":id")
  @ApiOperation({
    summary: "Update dictionary entry (admin only)",
    description:
      "Update baseForm, partOfSpeech, level, translation, notes, or forms (replaces all forms).",
  })
  @ApiParam({ name: "id", description: "Lemma ID (UUID)" })
  @ApiBody({ type: PatchEntryDto })
  @ApiOkResponse({ description: "Updated entry card." })
  @ApiNotFoundResponse({ description: "Entry not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  update(@Param("id") lemmaId: string, @Body() dto: PatchEntryDto) {
    return this.dictionaryService.updateEntry(lemmaId, dto);
  }

  // ─────────────────────────────────────────────────────
  // DELETE SINGLE
  // ─────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete dictionary entry (admin only)",
    description: "Deletes the lemma and all associated entry data (senses, examples, forms).",
  })
  @ApiParam({ name: "id", description: "Lemma ID (UUID)" })
  @ApiNoContentResponse({ description: "Deleted." })
  @ApiNotFoundResponse({ description: "Entry not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async deleteEntry(@Param("id") lemmaId: string) {
    await this.dictionaryService.deleteEntry(lemmaId);
  }

  // ─────────────────────────────────────────────────────
  // BULK DELETE
  // ─────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Delete()
  @ApiOperation({
    summary: "Bulk delete dictionary entries (admin only)",
    description: "Deletes multiple entries by lemma IDs.",
  })
  @ApiBody({ type: BulkDeleteDto })
  @ApiOkResponse({ description: "{ deleted: number }" })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  bulkDelete(@Body() dto: BulkDeleteDto) {
    return this.dictionaryService.bulkDelete(dto);
  }

  // ─────────────────────────────────────────────────────
  // IMPORT
  // ─────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Post("import")
  @UseInterceptors(FileInterceptor("file"))
  @ApiConsumes("multipart/form-data")
  @ApiOperation({
    summary: "Import dictionary entries from JSON file (admin only)",
    description:
      "Upload a JSON file (max 10 MB) with an array of entries. Skips existing normalized forms. Returns { created, skipped, total }.",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
    },
  })
  @ApiOkResponse({ description: "{ created, skipped, total }" })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async import(
    @UploadedFile() file: Express.Multer.File,
    @User("id") userId: string,
  ) {
    if (!file?.buffer) {
      return { created: 0, skipped: 0, total: 0 };
    }
    const raw = file.buffer.toString("utf-8");
    const records = JSON.parse(raw);
    return this.dictionaryService.importEntries(records, userId);
  }

  // ─────────────────────────────────────────────────────
  // SENSES
  // ─────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Post(":id/senses")
  @ApiOperation({
    summary: "Add sense to dictionary entry (admin only)",
    description: "Appends a new sense (meaning) to the entry's DictionaryEntry.",
  })
  @ApiParam({ name: "id", description: "Lemma ID (UUID)" })
  @ApiBody({ type: CreateSenseDto })
  @ApiCreatedResponse({ description: "Created sense: { id, order, definition, notes }" })
  @ApiNotFoundResponse({ description: "Entry not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  addSense(@Param("id") lemmaId: string, @Body() dto: CreateSenseDto) {
    return this.dictionaryService.addSense(lemmaId, dto);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Patch("senses/:senseId")
  @ApiOperation({
    summary: "Update a sense (admin only)",
    description: "Update definition, notes, or order of an existing sense.",
  })
  @ApiParam({ name: "senseId", description: "Sense ID (UUID)" })
  @ApiBody({ type: UpdateSenseDto })
  @ApiOkResponse({ description: "Updated sense." })
  @ApiNotFoundResponse({ description: "Sense not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  updateSense(@Param("senseId") senseId: string, @Body() dto: UpdateSenseDto) {
    return this.dictionaryService.updateSense(senseId, dto);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Delete("senses/:senseId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a sense (admin only)" })
  @ApiParam({ name: "senseId", description: "Sense ID (UUID)" })
  @ApiNoContentResponse({ description: "Deleted." })
  @ApiNotFoundResponse({ description: "Sense not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async deleteSense(@Param("senseId") senseId: string) {
    await this.dictionaryService.deleteSense(senseId);
  }

  // ─────────────────────────────────────────────────────
  // EXAMPLES
  // ─────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Post("senses/:senseId/examples")
  @ApiOperation({
    summary: "Add example to a sense (admin only)",
    description: "Adds an example sentence (with optional translation) to the given sense.",
  })
  @ApiParam({ name: "senseId", description: "Sense ID (UUID)" })
  @ApiBody({ type: CreateExampleDto })
  @ApiCreatedResponse({ description: "Created example: { id, text, translation }" })
  @ApiNotFoundResponse({ description: "Sense not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  addExample(@Param("senseId") senseId: string, @Body() dto: CreateExampleDto) {
    return this.dictionaryService.addExample(senseId, dto);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Delete("examples/:exampleId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete an example (admin only)" })
  @ApiParam({ name: "exampleId", description: "Example ID (UUID)" })
  @ApiNoContentResponse({ description: "Deleted." })
  @ApiNotFoundResponse({ description: "Example not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async deleteExample(@Param("exampleId") exampleId: string) {
    await this.dictionaryService.deleteExample(exampleId);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Patch("examples/:exampleId")
  @ApiOperation({ summary: "Update an example (admin only)" })
  @ApiParam({ name: "exampleId", description: "Example ID (UUID)" })
  @ApiBody({ type: UpdateExampleDto })
  @ApiOkResponse({ description: "Updated example: { id, text, translation }" })
  @ApiNotFoundResponse({ description: "Example not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  updateExample(@Param("exampleId") exampleId: string, @Body() dto: UpdateExampleDto) {
    return this.dictionaryService.updateExample(exampleId, dto);
  }

  // ─────────────────────────────────────────────────────
  // HEADWORDS
  // ─────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Post(":id/headwords")
  @ApiOperation({
    summary: "Add headword to entry (admin only)",
    description: "Adds an alternative spelling / headword to the dictionary entry.",
  })
  @ApiParam({ name: "id", description: "Lemma ID (UUID)" })
  @ApiBody({ type: CreateHeadwordDto })
  @ApiCreatedResponse({ description: "Created headword: { id, text, normalized, isPrimary, order }" })
  @ApiNotFoundResponse({ description: "Entry not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  addHeadword(@Param("id") lemmaId: string, @Body() dto: CreateHeadwordDto) {
    return this.dictionaryService.addHeadword(lemmaId, dto);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Delete("headwords/:hwId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a headword (admin only)" })
  @ApiParam({ name: "hwId", description: "Headword ID (UUID)" })
  @ApiNoContentResponse({ description: "Deleted." })
  @ApiNotFoundResponse({ description: "Headword not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async deleteHeadword(@Param("hwId") hwId: string) {
    await this.dictionaryService.deleteHeadword(hwId);
  }

  // ─────────────────────────────────────────────────────
  // MORPH FORMS (individual CRUD)
  // ─────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Post(":id/forms")
  @ApiOperation({
    summary: "Add morphological form to entry (admin only)",
    description: "Adds a single inflected form with optional grammatical case and number.",
  })
  @ApiParam({ name: "id", description: "Lemma ID (UUID)" })
  @ApiBody({ type: CreateMorphFormDto })
  @ApiCreatedResponse({ description: "Created form: { id, form, normalized, gramCase, gramNumber, grammarTag }" })
  @ApiNotFoundResponse({ description: "Entry not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  addMorphForm(@Param("id") lemmaId: string, @Body() dto: CreateMorphFormDto) {
    return this.dictionaryService.addMorphForm(lemmaId, dto);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Patch("forms/:formId")
  @ApiOperation({ summary: "Update a morphological form (admin only)" })
  @ApiParam({ name: "formId", description: "MorphForm ID (UUID)" })
  @ApiBody({ type: UpdateMorphFormDto })
  @ApiOkResponse({ description: "Updated form." })
  @ApiNotFoundResponse({ description: "Form not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  updateMorphForm(@Param("formId") formId: string, @Body() dto: UpdateMorphFormDto) {
    return this.dictionaryService.updateMorphForm(formId, dto);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Delete("forms/:formId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a morphological form (admin only)" })
  @ApiParam({ name: "formId", description: "MorphForm ID (UUID)" })
  @ApiNoContentResponse({ description: "Deleted." })
  @ApiNotFoundResponse({ description: "Form not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async deleteMorphForm(@Param("formId") formId: string) {
    await this.dictionaryService.deleteMorphForm(formId);
  }

  // ─────────────────────────────────────────────────────
  // NAVIGATION
  // ─────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Get(":id/next")
  @ApiOperation({ summary: "Get next dictionary entry (admin only)", description: "Returns the next entry alphabetically after the given lemma." })
  @ApiParam({ name: "id", description: "Lemma ID (UUID)" })
  @ApiOkResponse({ description: "{ id, baseForm, normalized } or null" })
  @ApiNotFoundResponse({ description: "Entry not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  getNextEntry(@Param("id") lemmaId: string) {
    return this.dictionaryService.getNextEntry(lemmaId);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Get(":id/prev")
  @ApiOperation({ summary: "Get previous dictionary entry (admin only)", description: "Returns the previous entry alphabetically before the given lemma." })
  @ApiParam({ name: "id", description: "Lemma ID (UUID)" })
  @ApiOkResponse({ description: "{ id, baseForm, normalized } or null" })
  @ApiNotFoundResponse({ description: "Entry not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  getPrevEntry(@Param("id") lemmaId: string) {
    return this.dictionaryService.getPrevEntry(lemmaId);
  }

  // ─────────────────────────────────────────────────────
  // USER STATS
  // ─────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Get(":id/user-stats")
  @ApiOperation({
    summary: "Get user dictionary stats for entry (admin only)",
    description: "Returns counts of users who saved this word by learning status.",
  })
  @ApiParam({ name: "id", description: "Lemma ID (UUID)" })
  @ApiOkResponse({ description: "{ totalAdded, countNew, countLearning, countKnown }" })
  @ApiNotFoundResponse({ description: "Entry not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  getUserStats(@Param("id") lemmaId: string) {
    return this.dictionaryService.getUserStatsForEntry(lemmaId);
  }

  // ─────────────────────────────────────────────────────
  // CORPUS CONTEXTS
  // ─────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Get(":id/contexts")
  @ApiOperation({
    summary: "Get corpus contexts for entry (admin only)",
    description: "Returns text snippets where this word was encountered during reading.",
  })
  @ApiParam({ name: "id", description: "Lemma ID (UUID)" })
  @ApiQuery({ name: "limit", required: false, type: Number, description: "Max results (default 20)" })
  @ApiOkResponse({ description: "{ total, items: [{ id, word, snippet, textId, textTitle, seenAt }] }" })
  @ApiNotFoundResponse({ description: "Entry not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  getContexts(@Param("id") lemmaId: string, @Query("limit") limit?: string) {
    return this.dictionaryService.getContextsForEntry(lemmaId, limit ? parseInt(limit, 10) : 20);
  }
}
