import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
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
import { Language, PermissionCode } from "@prisma/client";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { AdminTextPhraseService } from "./admin-text-phrase.service";
import {
  CreatePhraseAutoOccurrenceDto,
  CreatePhraseWithOccurrenceDto,
  CreateTextPhraseDto,
  CreateTextPhraseOccurrenceDto,
  UpdateTextPhraseDto,
} from "./dto/text-phrase.dto";

@ApiTags("admin/text-phrases")
@ApiBearerAuth()
@Controller("admin/text-phrases")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@ApiForbiddenResponse({ description: "Forbidden. CAN_EDIT_TEXTS permission required." })
export class AdminTextPhraseController {
  constructor(private readonly service: AdminTextPhraseService) {}

  // ── Phrases ──────────────────────────────────────────────────────────────

  @Get()
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @ApiOperation({ summary: "List text phrases (global dictionary)" })
  @ApiQuery({ name: "language", enum: Language, required: false })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ description: "Paginated phrases with occurrence count." })
  async listPhrases(
    @Query("language") language?: Language,
    @Query("page", new ParseIntPipe({ optional: true })) page = 1,
    @Query("limit", new ParseIntPipe({ optional: true })) limit = 50,
  ) {
    return this.service.listPhrases(language, page, Math.min(limit, 100));
  }

  @Get(":id")
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @ApiOperation({ summary: "Get a single text phrase with all occurrences" })
  @ApiParam({ name: "id", description: "TextPhrase UUID" })
  @ApiOkResponse({ description: "Phrase with occurrences and text titles." })
  @ApiNotFoundResponse({ description: "Phrase not found." })
  async getPhraseById(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.getPhraseById(id);
  }

  @Post()
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a new phrase (without occurrence)" })
  @ApiCreatedResponse({ description: "Phrase created." })
  async createPhrase(@Body() dto: CreateTextPhraseDto) {
    return this.service.createPhrase(dto);
  }

  @Patch(":id")
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @ApiOperation({ summary: "Update a phrase" })
  @ApiParam({ name: "id", description: "TextPhrase UUID" })
  @ApiOkResponse({ description: "Phrase updated." })
  @ApiNotFoundResponse({ description: "Phrase not found." })
  async updatePhrase(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateTextPhraseDto,
  ) {
    return this.service.updatePhrase(id, dto);
  }

  @Delete(":id")
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete a phrase and all its occurrences",
  })
  @ApiParam({ name: "id", description: "TextPhrase UUID" })
  @ApiNoContentResponse({ description: "Phrase deleted." })
  @ApiNotFoundResponse({ description: "Phrase not found." })
  async deletePhrase(@Param("id", ParseUUIDPipe) id: string) {
    await this.service.deletePhrase(id);
  }

  // ── Primary endpoint: create phrase + auto-detect token positions ─────────

  @Post("auto-occurrence")
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create (or reuse) a phrase and auto-detect token positions from page",
    description:
      "Finds the phrase words in the tokenized page and creates an occurrence automatically. Returns { phrase, occurrence }.",
  })
  @ApiCreatedResponse({ description: "{ phrase, occurrence }" })
  @ApiNotFoundResponse({ description: "Text, page, version not found or phrase words not in tokens." })
  async createAutoOccurrence(@Body() dto: CreatePhraseAutoOccurrenceDto) {
    return this.service.createPhraseAutoOccurrence(dto);
  }

  @Post("with-occurrence")
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create (or reuse) a phrase and add its occurrence in a text",
    description:
      "Main endpoint for the text editor. If a phrase with the same normalized text and language already exists, it is reused; only a new occurrence is created. Returns { phrase, occurrence }.",
  })
  @ApiCreatedResponse({ description: "{ phrase, occurrence }" })
  @ApiNotFoundResponse({ description: "Text not found." })
  async createWithOccurrence(@Body() dto: CreatePhraseWithOccurrenceDto) {
    return this.service.createPhraseWithOccurrence(dto);
  }

  // ── Occurrences ──────────────────────────────────────────────────────────

  @Post(":id/occurrences")
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Add an occurrence of an existing phrase to a text page" })
  @ApiParam({ name: "id", description: "TextPhrase UUID" })
  @ApiCreatedResponse({ description: "Occurrence created." })
  @ApiNotFoundResponse({ description: "Phrase or text not found." })
  async addOccurrence(
    @Param("id", ParseUUIDPipe) phraseId: string,
    @Body() dto: CreateTextPhraseOccurrenceDto,
  ) {
    return this.service.addOccurrence(phraseId, dto);
  }

  @Delete("occurrences/:occurrenceId")
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a phrase occurrence" })
  @ApiParam({ name: "occurrenceId", description: "TextPhraseOccurrence UUID" })
  @ApiNoContentResponse({ description: "Occurrence deleted." })
  @ApiNotFoundResponse({ description: "Occurrence not found." })
  async deleteOccurrence(@Param("occurrenceId", ParseUUIDPipe) occurrenceId: string) {
    await this.service.deleteOccurrence(occurrenceId);
  }

  // ── Read endpoint for admin text editor ──────────────────────────────────

  @Get("by-page/:textId/:pageNumber")
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @ApiOperation({ summary: "Get all phrase occurrences for a text page (admin)" })
  @ApiParam({ name: "textId", description: "Text UUID" })
  @ApiParam({ name: "pageNumber", description: "Page number (1-based)" })
  @ApiOkResponse({
    description: "Array of occurrences with phrase data (original, translation, notes).",
  })
  async getByPage(
    @Param("textId", ParseUUIDPipe) textId: string,
    @Param("pageNumber", ParseIntPipe) pageNumber: number,
  ) {
    return this.service.getOccurrencesForPage(textId, pageNumber);
  }
}
