import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { CreateEntryDto } from "src/admin/dictionary/dto/create-entry.dto";
import { DictionaryListQueryDto } from "src/admin/dictionary/dto/list-query.dto";
import { PatchEntryDto } from "src/admin/dictionary/dto/update-entry.dto";
import { Admin } from "src/auth/decorators/admin.decorator";
import { DictionaryService } from "src/markup-engine/dictionary/dictionary.service";
import { User } from "src/user/decorators/user.decorator";

@ApiTags("admin/dictionary")
@ApiBearerAuth()
@Controller("admin/dictionary")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class AdminDictionaryController {
  constructor(private dictionaryService: DictionaryService) {}

  @Admin()
  @Get()
  @ApiOperation({
    summary: "List dictionary entries (admin only)",
    description:
      "Search and paginate admin dictionary. Query: q (search), language, page, limit.",
  })
  @ApiOkResponse({
    description: "Object with items[], total, page, limit.",
  })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  list(@Query() query: DictionaryListQueryDto) {
    return this.dictionaryService.getListForAdmin({
      q: query.q,
      language: query.language,
      page: query.page,
      limit: query.limit,
    });
  }

  @Admin()
  @Get(":id")
  @ApiOperation({
    summary: "Get dictionary entry card by lemma id (admin only)",
    description: "Returns lemma, translation, notes, forms.",
  })
  @ApiParam({ name: "id", description: "Lemma ID (UUID)" })
  @ApiOkResponse({
    description: "Entry card: id, baseForm, normalized, language, partOfSpeech, translation, notes, forms.",
  })
  @ApiNotFoundResponse({ description: "Entry not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  getCard(@Param("id") lemmaId: string) {
    return this.dictionaryService.getCardForAdmin(lemmaId);
  }

  @Admin()
  @Post()
  @ApiOperation({
    summary: "Create dictionary entry (admin only)",
    description:
      "Creates a new dictionary entry: word, normalized form, language, translation, optional part of speech, notes, and forms. Requires admin role.",
  })
  @ApiBody({
    description: "Dictionary entry payload.",
    type: CreateEntryDto,
  })
  @ApiCreatedResponse({
    description: "Dictionary entry created successfully.",
  })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  create(@Body() dto: CreateEntryDto, @User("id") userId: string) {
    return this.dictionaryService.createEntry(dto, userId);
  }

  @Admin()
  @Patch(":id")
  @ApiOperation({
    summary: "Update dictionary entry (admin only)",
    description:
      "Update baseForm, partOfSpeech, translation, notes, or forms (replaces all forms). Lemma ID in path.",
  })
  @ApiParam({ name: "id", description: "Lemma ID (UUID)" })
  @ApiBody({
    description: "Fields to update (all optional).",
    type: PatchEntryDto,
  })
  @ApiOkResponse({
    description: "Updated entry card.",
  })
  @ApiNotFoundResponse({ description: "Entry not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  update(@Param("id") lemmaId: string, @Body() dto: PatchEntryDto) {
    return this.dictionaryService.updateEntry(lemmaId, dto);
  }
}
