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
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Admin } from "src/auth/decorators/admin.decorator";
import { User } from "src/user/decorators/user.decorator";
import { AdminUnknownWordsService } from "./admin-unknown-words.service";
import { AddToDictionaryDto } from "./dto/add-dictionary.dto";
import { FetchUnknownWordsDto } from "./dto/fetch-unknown-words.dto";
import { LinkToLemmaDto } from "./dto/link-lemma.dto";

@ApiTags("admin/unknown-words")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@Controller("admin/unknown-words")
export class AdminUnknownWordsController {
  constructor(
    private readonly adminUnknownWordsService: AdminUnknownWordsService,
  ) {}

  @Admin()
  @Get()
  @ApiOperation({
    summary: "List unknown words",
    description:
      "Paginated list with optional search (q). Each item includes texts where the word appears.",
  })
  @ApiOkResponse({
    description: "Object with items (word, normalized, seenCount, firstSeen, lastSeen, texts), total, page, limit.",
  })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async getUnknownWords(@Query() query: FetchUnknownWordsDto) {
    return this.adminUnknownWordsService.getUnknownWords(query);
  }

  @Admin()
  @Post(":id/add-to-dictionary")
  @ApiOperation({
    summary: "Add unknown word to dictionary",
    description:
      "Creates a dictionary entry for this word and removes it from the unknown list.",
  })
  @ApiParam({ name: "id", description: "Unknown word UUID" })
  @ApiOkResponse({
    description: "Created lemma and removedUnknownWordId.",
  })
  @ApiNotFoundResponse({ description: "Unknown word not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async addUnknownWordToDictionary(
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

  @Admin()
  @Post(":id/link")
  @ApiOperation({
    summary: "Link unknown word to existing lemma",
    description:
      "Adds the unknown word as a morph form to the given lemma and removes it from the unknown list.",
  })
  @ApiParam({ name: "id", description: "Unknown word UUID" })
  @ApiOkResponse({
    description: "lemmaId and removedUnknownWordId.",
  })
  @ApiNotFoundResponse({ description: "Unknown word or lemma not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async linkToLemma(
    @Param("id") id: string,
    @Body() dto: LinkToLemmaDto,
  ) {
    return this.adminUnknownWordsService.linkToLemma(id, dto.lemmaId);
  }

  @Admin()
  @Get(":id")
  @ApiOperation({
    summary: "Get unknown word by id",
    description: "Returns word with texts where it appears.",
  })
  @ApiParam({ name: "id", description: "Unknown word UUID" })
  @ApiOkResponse({
    description: "Unknown word with texts[] (id, title).",
  })
  @ApiNotFoundResponse({ description: "Unknown word not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async getUnknownWordById(@Param("id") id: string) {
    return this.adminUnknownWordsService.getUnknownWordById(id);
  }

  @Admin()
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Remove unknown word from list",
    description: "Deletes the unknown word record.",
  })
  @ApiParam({ name: "id", description: "Unknown word UUID" })
  @ApiNoContentResponse({ description: "Deleted." })
  @ApiNotFoundResponse({ description: "Unknown word not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async remove(@Param("id") id: string) {
    await this.adminUnknownWordsService.remove(id);
  }
}
