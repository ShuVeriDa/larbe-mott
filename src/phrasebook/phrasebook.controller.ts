import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Language } from "@prisma/client";
import { Auth } from "src/auth/decorators/auth.decorator";
import { User } from "src/user/decorators/user.decorator";
import { PhrasebookService } from "./phrasebook.service";
import { SuggestPhraseDto } from "./dto/suggest-phrase.dto";

@ApiTags("phrasebook")
@ApiBearerAuth()
@Controller("phrasebook")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class PhrasebookController {
  constructor(private readonly phrasebookService: PhrasebookService) {}

  @Get("stats")
  @Auth()
  @ApiOperation({
    summary: "Get phrasebook stats",
    description:
      "Returns total phrase count, category count, and saved count for the current user.",
  })
  @ApiOkResponse({ description: "Phrasebook stats" })
  async getStats(@User("id") userId: string) {
    return this.phrasebookService.getStats(userId);
  }

  @Get("categories")
  @Auth()
  @ApiOperation({
    summary: "Get all phrasebook categories",
    description: "Returns all categories with phrase count.",
  })
  @ApiOkResponse({ description: "List of categories" })
  async getCategories(@User("id") userId: string) {
    return this.phrasebookService.getCategories(userId);
  }

  @Get("phrases")
  @Auth()
  @ApiOperation({
    summary: "Get phrasebook phrases",
    description:
      "Returns phrases with optional filters by category, language, saved status, and search term.",
  })
  @ApiOkResponse({ description: "List of phrases with words and examples" })
  @ApiQuery({ name: "categoryId", required: false })
  @ApiQuery({ name: "lang", required: false, enum: Language })
  @ApiQuery({ name: "saved", required: false, type: Boolean })
  @ApiQuery({ name: "search", required: false })
  async getPhrases(
    @User("id") userId: string,
    @Query("categoryId") categoryId?: string,
    @Query("lang") lang?: Language,
    @Query("saved") saved?: string,
    @Query("search") search?: string,
  ) {
    return this.phrasebookService.getPhrases(userId, {
      categoryId,
      lang,
      savedOnly: saved === "true",
      search,
    });
  }

  @Post("suggestions")
  @Auth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Suggest a phrase",
    description: "Submit a phrase suggestion from the current user.",
  })
  @ApiOkResponse({ description: "Suggestion created" })
  async suggestPhrase(
    @User("id") userId: string,
    @Body() dto: SuggestPhraseDto,
  ) {
    return this.phrasebookService.suggestPhrase(userId, dto);
  }

  @Post("saves/:phraseId")
  @Auth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Toggle save phrase",
    description: "Saves or unsaves a phrase for the current user.",
  })
  @ApiOkResponse({ description: "{ saved: boolean }" })
  @ApiNotFoundResponse({ description: "Phrase not found" })
  async toggleSave(
    @User("id") userId: string,
    @Param("phraseId", ParseUUIDPipe) phraseId: string,
  ) {
    return this.phrasebookService.toggleSave(userId, phraseId);
  }
}
