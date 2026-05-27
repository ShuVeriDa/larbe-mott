import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
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
import { PhraseProgressService } from "./phrase-progress.service";
import { SuggestPhraseDto } from "./dto/suggest-phrase.dto";
import { RatePhraseDto } from "./dto/rate-phrase.dto";

@ApiTags("phrasebook")
@ApiBearerAuth()
@Controller("phrasebook")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class PhrasebookController {
  constructor(
    private readonly phrasebookService: PhrasebookService,
    private readonly phraseProgressService: PhraseProgressService,
  ) {}

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

  // ── Review / Progress ─────────────────────────────────────────────────────

  @Get("review/stats")
  @Auth()
  @ApiOperation({
    summary: "Get phrase review stats",
    description: "Returns due count, streak, learning/known counts, and today's review count.",
  })
  @ApiOkResponse({ description: "Review stats" })
  async getReviewStats(@User("id") userId: string) {
    return this.phraseProgressService.getReviewStats(userId);
  }

  @Get("review/due")
  @Auth()
  @ApiOperation({
    summary: "Get phrases due for review",
    description: "Returns phrases due today (or never reviewed). Optionally filtered by category or saved-only.",
  })
  @ApiOkResponse({ description: "List of phrases due for review" })
  @ApiQuery({ name: "categoryId", required: false })
  @ApiQuery({ name: "savedOnly", required: false, type: Boolean })
  async getDueReview(
    @User("id") userId: string,
    @Query("categoryId") categoryId?: string,
    @Query("savedOnly", new ParseBoolPipe({ optional: true })) savedOnly?: boolean,
  ) {
    return this.phraseProgressService.getDueReview(userId, categoryId, savedOnly);
  }

  @Get("review/categories")
  @Auth()
  @ApiOperation({
    summary: "Get per-category progress",
    description: "Returns each category with known/learning counts and progress percent.",
  })
  @ApiOkResponse({ description: "Category progress list" })
  async getCategoryProgress(@User("id") userId: string) {
    return this.phraseProgressService.getCategoryProgress(userId);
  }

  @Post("progress/:phraseId/rate")
  @Auth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Submit phrase review rating",
    description: "Apply SM-2 algorithm for the given phrase. Quality 0-5.",
  })
  @ApiOkResponse({ description: "Updated progress record" })
  @ApiNotFoundResponse({ description: "Phrase not found" })
  async ratePhrase(
    @User("id") userId: string,
    @Param("phraseId", ParseUUIDPipe) phraseId: string,
    @Body() dto: RatePhraseDto,
  ) {
    return this.phraseProgressService.submitReview(userId, phraseId, dto.quality);
  }
}
