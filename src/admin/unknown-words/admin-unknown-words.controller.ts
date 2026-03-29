import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { AdminUnknownWordsService } from "./admin-unknown-words.service";
import { AddToDictionaryDto } from "./dto/add-dictionary.dto";
import { BulkDeleteUnknownWordsDto } from "./dto/bulk-delete.dto";
import { FetchUnknownWordsDto } from "./dto/fetch-unknown-words.dto";
import { LinkToLemmaDto } from "./dto/link-lemma.dto";

@ApiTags("admin/unknown-words")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
@Controller("admin/unknown-words")
export class AdminUnknownWordsController {
  constructor(
    private readonly adminUnknownWordsService: AdminUnknownWordsService,
  ) {}

  // ─── Stats ──────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Get("stats")
  @ApiOperation({
    summary: "Get unknown words statistics",
    description:
      "Returns counts: pending, addedToDictionary, linkedToLemma, deleted, encounteredToday, textsToday.",
  })
  @ApiOkResponse({
    description:
      "{ totalPending, totalAddedToDictionary, totalLinkedToLemma, totalDeleted, encounteredToday, textsToday }",
  })
  getStats() {
    return this.adminUnknownWordsService.getStats();
  }

  // ─── List ────────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Get()
  @ApiOperation({
    summary: "List unknown words (PENDING)",
    description:
      "Paginated list of unknown words. Supports search, textId filter, sort and tab (all/frequent/rare). Returns tabs counts.",
  })
  @ApiOkResponse({
    description:
      "{ items, total, page, limit, tabs: { all, frequent, rare } }",
  })
  getUnknownWords(@Query() query: FetchUnknownWordsDto) {
    return this.adminUnknownWordsService.getUnknownWords(query);
  }

  // ─── Clear all ───────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Clear all pending unknown words",
    description:
      "Soft-deletes all PENDING unknown words (marks as DELETED). Does not affect words already added to dictionary.",
  })
  @ApiOkResponse({ description: "{ deleted: number }" })
  clearAll() {
    return this.adminUnknownWordsService.clearAll();
  }

  // ─── Bulk delete ─────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Post("bulk/delete")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Bulk delete unknown words",
    description: "Soft-deletes selected unknown words by their IDs.",
  })
  @ApiBody({ type: BulkDeleteUnknownWordsDto })
  @ApiOkResponse({ description: "{ deleted: number }" })
  bulkDelete(@Body() dto: BulkDeleteUnknownWordsDto) {
    return this.adminUnknownWordsService.bulkDelete(dto);
  }

  // ─── Add to dictionary ───────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Post(":id/add-to-dictionary")
  @ApiOperation({
    summary: "Add unknown word to dictionary",
    description:
      "Creates a dictionary entry (lemma) for this word. Marks the unknown word as ADDED_TO_DICTIONARY.",
  })
  @ApiParam({ name: "id", description: "Unknown word UUID" })
  @ApiOkResponse({ description: "{ lemma, resolvedUnknownWordId }" })
  @ApiNotFoundResponse({ description: "Unknown word not found." })
  addToDictionary(
    @Param("id") id: string,
    @Body() dto: AddToDictionaryDto,
    @User("id") userId: string,
  ) {
    return this.adminUnknownWordsService.addUnknownWordToDictionary(
      id,
      dto,
      userId,
    );
  }

  // ─── Link to existing lemma ──────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Post(":id/link")
  @ApiOperation({
    summary: "Link unknown word to existing lemma",
    description:
      "Adds the word as a MorphForm of the given lemma. Marks the unknown word as LINKED_TO_LEMMA.",
  })
  @ApiParam({ name: "id", description: "Unknown word UUID" })
  @ApiOkResponse({ description: "{ lemmaId, resolvedUnknownWordId }" })
  @ApiNotFoundResponse({ description: "Unknown word or lemma not found." })
  linkToLemma(@Param("id") id: string, @Body() dto: LinkToLemmaDto) {
    return this.adminUnknownWordsService.linkToLemma(id, dto.lemmaId);
  }

  // ─── Contexts ────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Get(":id/contexts")
  @ApiOperation({
    summary: "Get all contexts for an unknown word",
    description:
      "Returns all TextToken occurrences of this word with text snippets (±60 chars around the word), text title and page number.",
  })
  @ApiParam({ name: "id", description: "Unknown word UUID" })
  @ApiOkResponse({
    description:
      "{ unknownWord, total, contexts: [ { tokenId, original, position, snippet, textId, textTitle, pageNumber } ] }",
  })
  @ApiNotFoundResponse({ description: "Unknown word not found." })
  getContexts(@Param("id") id: string) {
    return this.adminUnknownWordsService.getContexts(id);
  }

  // ─── Single ──────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Get(":id")
  @ApiOperation({
    summary: "Get unknown word by ID",
    description: "Returns the unknown word with a list of texts where it appears.",
  })
  @ApiParam({ name: "id", description: "Unknown word UUID" })
  @ApiOkResponse({ description: "Unknown word with texts[] (id, title)." })
  @ApiNotFoundResponse({ description: "Unknown word not found." })
  getById(@Param("id") id: string) {
    return this.adminUnknownWordsService.getUnknownWordById(id);
  }

  // ─── Delete single ───────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Remove unknown word from list",
    description: "Soft-deletes the unknown word (marks as DELETED).",
  })
  @ApiParam({ name: "id", description: "Unknown word UUID" })
  @ApiNoContentResponse({ description: "Deleted." })
  @ApiNotFoundResponse({ description: "Unknown word not found." })
  async remove(@Param("id") id: string) {
    await this.adminUnknownWordsService.remove(id);
  }
}
