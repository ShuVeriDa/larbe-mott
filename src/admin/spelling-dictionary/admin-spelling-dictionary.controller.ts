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
}
