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
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { PermissionCode } from "@prisma/client";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { User } from "src/user/decorators/user.decorator";
import { AdminSpellingDictionaryService } from "./admin-spelling-dictionary.service";
import { CreateSpellingEntryDto } from "./dto/create-spelling-entry.dto";
import { FetchSpellingEntriesDto } from "./dto/fetch-spelling-entries.dto";
import { FetchSpellingOccurrenceTextsDto } from "./dto/fetch-spelling-occurrence-texts.dto";
import { FetchSpellingOccurrencesDto } from "./dto/fetch-spelling-occurrences.dto";
import { FindReplaceOccurrencesDto } from "./dto/find-replace-occurrences.dto";
import { FindReplaceTextsDto } from "./dto/find-replace-texts.dto";
import { UpdateSpellingEntryDto } from "./dto/update-spelling-entry.dto";

@ApiTags("admin/spelling-dictionary")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@ApiForbiddenResponse({ description: "Forbidden. CAN_EDIT_TEXTS permission required." })
@Controller("admin/spelling-dictionary")
export class AdminSpellingDictionaryController {
  constructor(
    private readonly spellingDictionaryService: AdminSpellingDictionaryService,
  ) {}

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get()
  @ApiOperation({ summary: "List spelling entries (paginated, with search)" })
  @ApiOkResponse({ description: "{ items, total, page, limit }" })
  getEntries(@Query() query: FetchSpellingEntriesDto) {
    return this.spellingDictionaryService.getEntries(query);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post()
  @ApiOperation({ summary: "Create a new spelling entry" })
  @ApiConflictResponse({ description: "Entry for this wrongForm already exists" })
  createEntry(
    @Body() dto: CreateSpellingEntryDto,
    @User("id") userId: string,
  ) {
    return this.spellingDictionaryService.createEntry(dto, userId);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Patch(":id")
  @ApiOperation({ summary: "Update a spelling entry" })
  @ApiNotFoundResponse({ description: "Spelling entry not found" })
  @ApiConflictResponse({ description: "Entry for the new wrongForm already exists" })
  updateEntry(
    @Param("id") id: string,
    @Body() dto: UpdateSpellingEntryDto,
  ) {
    return this.spellingDictionaryService.updateEntry(id, dto);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Delete(":id")
  @ApiOperation({ summary: "Delete a spelling entry" })
  @ApiNotFoundResponse({ description: "Spelling entry not found" })
  deleteEntry(@Param("id") id: string) {
    return this.spellingDictionaryService.deleteEntry(id);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get("find-replace/occurrences")
  @ApiOperation({ summary: "Ad-hoc find & replace: list occurrences of an arbitrary wrongForm (no SpellingEntry required)" })
  @ApiOkResponse({ description: "{ items, total, page, limit, canBulkFix: true }" })
  findReplaceOccurrences(@Query() query: FindReplaceOccurrencesDto) {
    return this.spellingDictionaryService
      .findOccurrences({
        wrongForm: query.wrongForm,
        matchType: query.matchType,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        textIds: query.textIds,
      })
      .then((result) => ({ ...result, canBulkFix: true }));
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get("find-replace/texts")
  @ApiOperation({ summary: "Ad-hoc find & replace: list texts (published + drafts) containing an arbitrary wrongForm" })
  findReplaceTexts(@Query() query: FindReplaceTextsDto) {
    return this.spellingDictionaryService.findOccurrenceTexts({
      wrongForm: query.wrongForm,
      matchType: query.matchType,
      search: query.search,
    });
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get(":id/occurrences")
  @ApiOperation({ summary: "List occurrences of an entry's wrongForm across the library (published + drafts)" })
  @ApiOkResponse({ description: "{ items, total, page, limit, canBulkFix }" })
  @ApiNotFoundResponse({ description: "Spelling entry not found" })
  getOccurrences(
    @Param("id") id: string,
    @Query() query: FetchSpellingOccurrencesDto,
  ) {
    return this.spellingDictionaryService.getOccurrences(id, query);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get(":id/occurrence-texts")
  @ApiOperation({ summary: "List texts (published + drafts) that contain an entry's wrongForm (for the occurrences filter)" })
  @ApiNotFoundResponse({ description: "Spelling entry not found" })
  getOccurrenceTexts(
    @Param("id") id: string,
    @Query() query: FetchSpellingOccurrenceTextsDto,
  ) {
    return this.spellingDictionaryService.getOccurrenceTexts(id, query);
  }
}
