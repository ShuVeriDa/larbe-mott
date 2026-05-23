import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Auth } from "src/auth/decorators/auth.decorator";
import { RequiresPremium } from "src/auth/decorators/premium.decorator";
import { User } from "src/user/decorators/user.decorator";
import { DictionaryService } from "./dictionary.service";
import { BulkAssignEntriesDto } from "./dto/bulk-assign-entries.dto";
import { CreateDictionaryEntryDto } from "./dto/create-dictionary-entry.dto";
import { CreateDictionaryFolderDto } from "./dto/create-folder";
import { GetDictionaryEntriesDto } from "./dto/get-dictionary-entries.dto";
import { ReorderFoldersDto } from "./dto/reorder-folders.dto";
import { UpdateDictionaryEntryDto } from "./dto/update-dictionary-entry.dto";
import { UpdateDictionaryFolderDto } from "./dto/update-folder";
import { FoldersService } from "./folders.service";

@ApiTags("dictionary")
@ApiBearerAuth()
@Controller("dictionary")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class DictionaryController {
  constructor(
    private readonly dictionaryService: DictionaryService,
    private readonly foldersService: FoldersService,
  ) {}

  @Get()
  @Auth()
  @ApiOperation({
    summary: "Get all dictionary entries",
    description:
      "Get dictionary entries for the authenticated user. Supports filtering by status, cefrLevel, folderId and sorting.",
  })
  @ApiOkResponse({ description: "Dictionary entries" })
  async getDictionaryEntries(
    @User("id") userId: string,
    @Query() query: GetDictionaryEntriesDto,
  ) {
    return await this.dictionaryService.getUserDictionaryEntries(userId, query);
  }

  @Get("stats")
  @Auth()
  @ApiOperation({
    summary: "Get dictionary stats",
    description: "Get dictionary stats for the authenticated user",
  })
  @ApiOkResponse({ description: "Dictionary stats" })
  async getDictionaryStats(@User("id") userId: string) {
    return await this.dictionaryService.getUserDictionaryStats(userId);
  }

  @Get("folders")
  @Auth()
  @ApiOperation({
    summary: "Get all dictionary folders",
    description:
      "List the authenticated user's dictionary folders. Read access is open to all users; creation/modification of folders requires Premium.",
  })
  @ApiOkResponse({ description: "All dictionary folders" })
  async getDictionaryFolders(@User("id") userId: string) {
    return await this.foldersService.getUserDictionaryFolders(userId);
  }

  @Get("folders/summary")
  @Auth()
  @ApiOperation({
    summary: "Get folders summary",
    description:
      "Summary stats for the vocabulary folders page: folder count, words in folders, known words, words without folder. Read-only — available to all authenticated users.",
  })
  @ApiOkResponse({ description: "Folders summary" })
  async getDictionaryFoldersSummary(@User("id") userId: string) {
    return await this.foldersService.getUserDictionaryFoldersSummary(userId);
  }

  @Get("folders/:id")
  @Auth()
  @ApiOperation({
    summary: "Get a dictionary folder by ID",
    description:
      "Returns a single folder owned by the authenticated user. Read-only — available to all authenticated users.",
  })
  @ApiOkResponse({ description: "Dictionary folder" })
  @ApiNotFoundResponse({ description: "Dictionary folder not found" })
  async getDictionaryFolder(
    @Param("id", ParseUUIDPipe) id: string,
    @User("id") userId: string,
  ) {
    return await this.foldersService.getUserDictionaryFolder(id, userId);
  }

  @Get("due")
  @Auth()
  @ApiOperation({
    summary: "Get words due for review",
    description:
      "Get words whose next review date is now or in the past, ordered by review date",
  })
  @ApiOkResponse({ description: "Due words with count and next scheduled review" })
  async getDueWords(@User("id") userId: string) {
    return await this.dictionaryService.getDueWords(userId);
  }

  @Get(":id")
  @Auth()
  @ApiOperation({
    summary: "Get a dictionary entry by ID",
    description:
      "Returns full word detail: lemma (transliteration, POS, frequency, morphForms, audioUrl, declensionClass), meanings with examples (with origin), related words, occurrences in user's texts, SM-2 progress (with targetRepetitions), and review history (with intervalDelta).",
  })
  @ApiOkResponse({ description: "Dictionary entry detail" })
  @ApiNotFoundResponse({ description: "Dictionary entry not found" })
  async getDictionaryEntry(
    @Param("id", ParseUUIDPipe) id: string,
    @User("id") userId: string,
  ) {
    return await this.dictionaryService.getUserDictionaryEntryDetail(id, userId);
  }

  @Get(":id/neighbors")
  @Auth()
  @ApiOperation({
    summary: "Get prev/next dictionary entries",
    description:
      "Returns the entry before and after the given one within the same filter/sort context as the list view. Accepts the same query parameters as GET /dictionary.",
  })
  @ApiOkResponse({
    description: "{ prev: { id, word } | null, next: { id, word } | null }",
  })
  @ApiNotFoundResponse({ description: "Dictionary entry not found" })
  async getDictionaryEntryNeighbors(
    @Param("id", ParseUUIDPipe) id: string,
    @User("id") userId: string,
    @Query() query: GetDictionaryEntriesDto,
  ) {
    return await this.dictionaryService.getUserDictionaryEntryNeighbors(
      id,
      userId,
      query,
    );
  }

  @Post()
  @Auth()
  @ApiOperation({
    summary: "Create a new dictionary entry",
    description: "Create a new dictionary entry for the authenticated user",
  })
  @ApiOkResponse({ description: "Dictionary entry created" })
  async createDictionaryEntry(
    @Body() dto: CreateDictionaryEntryDto,
    @User("id") userId: string,
  ) {
    return await this.dictionaryService.createUserDictionaryEntry(dto, userId);
  }

  @Patch("folders/reorder")
  @RequiresPremium()
  @ApiOperation({
    summary: "Reorder dictionary folders",
    description:
      "Set sortOrder for all of the user's folders in one transaction. Body must contain every folder ID owned by the user, in the desired order. Requires Premium.",
  })
  @ApiOkResponse({ description: "Folders reordered" })
  async reorderDictionaryFolders(
    @Body() dto: ReorderFoldersDto,
    @User("id") userId: string,
  ) {
    return await this.foldersService.reorderUserDictionaryFolders(dto, userId);
  }

  @Patch("entries/bulk-assign")
  @RequiresPremium()
  @ApiOperation({
    summary: "Bulk assign dictionary entries to folders",
    description:
      "Assign or remove folderId for multiple dictionary entries in one transaction. Powers the 'Distribute all' action on the folders page. Requires Premium.",
  })
  @ApiOkResponse({ description: "Entries reassigned" })
  async bulkAssignDictionaryEntries(
    @Body() dto: BulkAssignEntriesDto,
    @User("id") userId: string,
  ) {
    return await this.dictionaryService.bulkAssignEntriesToFolder(
      dto.assignments,
      userId,
    );
  }

  @Patch("folders/:id")
  @RequiresPremium()
  @ApiOperation({
    summary: "Update a dictionary folder",
    description: "Update a dictionary folder for the authenticated user. Requires Premium.",
  })
  @ApiOkResponse({ description: "Dictionary folder updated" })
  async updateDictionaryFolder(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateDictionaryFolderDto,
    @User("id") userId: string,
  ) {
    return await this.foldersService.updateUserDictionaryFolder(
      dto,
      id,
      userId,
    );
  }

  @Post("folders")
  @RequiresPremium()
  @ApiOperation({
    summary: "Create a new dictionary folder",
    description: "Create a new dictionary folder for the authenticated user. Requires Premium.",
  })
  @ApiOkResponse({ description: "Dictionary folder created" })
  async createDictionaryFolder(
    @Body() dto: CreateDictionaryFolderDto,
    @User("id") userId: string,
  ) {
    return await this.foldersService.createUserDictionaryFolder(dto, userId);
  }

  @Patch(":id")
  @Auth()
  @ApiOperation({
    summary: "Update a dictionary entry",
    description: "Update a dictionary entry for the authenticated user",
  })
  @ApiOkResponse({ description: "Dictionary entry updated" })
  async updateDictionaryEntry(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateDictionaryEntryDto,
    @User("id") userId: string,
  ) {
    return await this.dictionaryService.updateUserDictionaryEntry(
      dto,
      id,
      userId,
    );
  }

  @Delete("folders/:id")
  @RequiresPremium()
  @ApiOperation({
    summary: "Delete a dictionary folder",
    description: "Delete a dictionary folder for the authenticated user. Requires Premium.",
  })
  @ApiOkResponse({ description: "Dictionary folder deleted" })
  async deleteDictionaryFolder(
    @Param("id", ParseUUIDPipe) id: string,
    @User("id") userId: string,
  ) {
    return await this.foldersService.deleteUserDictionaryFolderById(id, userId);
  }

  @Delete(":id")
  @Auth()
  @ApiOperation({
    summary: "Delete a dictionary entry",
    description: "Delete a dictionary entry for the authenticated user",
  })
  @ApiOkResponse({ description: "Dictionary entry deleted" })
  async deleteDictionaryEntry(
    @Param("id", ParseUUIDPipe) id: string,
    @User("id") userId: string,
  ) {
    return await this.dictionaryService.deleteUserDictionaryEntryById(
      id,
      userId,
    );
  }
}
