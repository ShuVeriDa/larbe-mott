import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { CreateDictionaryEntryDto } from "./dto/create-dictionary-entry.dto";
import { CreateDictionaryFolderDto } from "./dto/create-folder";
import { GetDictionaryEntriesDto } from "./dto/get-dictionary-entries.dto";
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
  @RequiresPremium()
  @ApiOperation({
    summary: "Get all dictionary folders",
    description: "Get all dictionary folders for the authenticated user. Requires Premium.",
  })
  @ApiOkResponse({ description: "All dictionary folders" })
  async getDictionaryFolders(@User("id") userId: string) {
    return await this.foldersService.getUserDictionaryFolders(userId);
  }

  @Get("folders/summary")
  @RequiresPremium()
  @ApiOperation({
    summary: "Get folders summary",
    description: "Get summary stats for the vocabulary folders page: folder count, words in folders, known words, words without folder. Requires Premium.",
  })
  @ApiOkResponse({ description: "Folders summary" })
  async getDictionaryFoldersSummary(@User("id") userId: string) {
    return await this.foldersService.getUserDictionaryFoldersSummary(userId);
  }

  @Get("folders/:id")
  @RequiresPremium()
  @ApiOperation({
    summary: "Get a dictionary folder by ID",
    description: "Get a dictionary folder by ID for the authenticated user. Requires Premium.",
  })
  @ApiOkResponse({ description: "Dictionary folder" })
  @ApiNotFoundResponse({ description: "Dictionary folder not found" })
  async getDictionaryFolder(
    @Param("id") id: string,
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
      "Returns full word detail: lemma (transliteration, POS, frequency, morphForms), meanings with examples, occurrences in user's texts, SM-2 progress, and review history.",
  })
  @ApiOkResponse({ description: "Dictionary entry detail" })
  @ApiNotFoundResponse({ description: "Dictionary entry not found" })
  async getDictionaryEntry(
    @Param("id") id: string,
    @User("id") userId: string,
  ) {
    return await this.dictionaryService.getUserDictionaryEntryDetail(id, userId);
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

  @Patch(":id")
  @Auth()
  @ApiOperation({
    summary: "Update a dictionary entry",
    description: "Update a dictionary entry for the authenticated user",
  })
  @ApiOkResponse({ description: "Dictionary entry updated" })
  async updateDictionaryEntry(
    @Param("id") id: string,
    @Body() dto: UpdateDictionaryEntryDto,
    @User("id") userId: string,
  ) {
    return await this.dictionaryService.updateUserDictionaryEntry(
      dto,
      id,
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
    @Param("id") id: string,
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

  @Delete(":id")
  @Auth()
  @ApiOperation({
    summary: "Delete a dictionary entry",
    description: "Delete a dictionary entry for the authenticated user",
  })
  @ApiOkResponse({ description: "Dictionary entry deleted" })
  async deleteDictionaryEntry(
    @Param("id") id: string,
    @User("id") userId: string,
  ) {
    return await this.dictionaryService.deleteUserDictionaryEntryById(
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
    @Param("id") id: string,
    @User("id") userId: string,
  ) {
    return await this.foldersService.deleteUserDictionaryFolderById(id, userId);
  }
}
