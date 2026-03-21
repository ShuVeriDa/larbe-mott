import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Auth } from "src/auth/decorators/auth.decorator";
import { User } from "src/user/decorators/user.decorator";
import { TextProgressService } from "./text-progress/text-progress.service";
import { WordProgressService } from "./word-progress/word-progress.service";
import { SubmitReviewDto } from "./dto/submit-review.dto";

@ApiTags("progress")
@ApiBearerAuth()
@Controller("progress")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class ProgressController {
  constructor(
    private readonly textProgress: TextProgressService,
    private readonly wordProgress: WordProgressService,
  ) {}

  // ─── text ────────────────────────────────────────────────────────────────────

  @Auth()
  @Get("text/:id")
  @ApiOperation({ summary: "Get progress for a text" })
  @ApiParam({ name: "id", description: "Text ID (UUID)" })
  @ApiOkResponse({ description: "Object with progress: number 0..100 (percentage)." })
  async getTextProgress(
    @Param("id") textId: string,
    @User("id") userId: string,
  ) {
    const progress = await this.textProgress.calculateProgress(userId, textId);
    return { progress };
  }

  // ─── review — статичный маршрут ВЫШЕ параметрического ────────────────────────

  @Auth()
  @Get("review/due")
  @ApiOperation({
    summary: "Get words due for review",
    description: "Returns words scheduled for spaced repetition review today.",
  })
  @ApiQuery({ name: "limit", required: false, description: "Max words to return (default 20)" })
  @ApiOkResponse({ description: "List of words due for review with lemma info." })
  async getDueWords(
    @User("id") userId: string,
    @Query("limit") limit?: string,
  ) {
    const parsed = parseInt(limit ?? "", 10);
    return this.wordProgress.getDueWords(userId, Number.isFinite(parsed) && parsed > 0 ? parsed : 20);
  }

  @Auth()
  @Post("review/:lemmaId")
  @ApiOperation({
    summary: "Submit word review result",
    description: "Processes SM-2 algorithm with quality score (0-5). 0-2 = fail, 3-5 = pass.",
  })
  @ApiParam({ name: "lemmaId", description: "Lemma ID" })
  @ApiOkResponse({ description: "Updated word progress record." })
  async submitReview(
    @Param("lemmaId") lemmaId: string,
    @User("id") userId: string,
    @Body() dto: SubmitReviewDto,
  ) {
    return this.wordProgress.submitReview(userId, lemmaId, dto.quality);
  }

  // ─── words ───────────────────────────────────────────────────────────────────

  @Auth()
  @Get("words/:lemmaId/contexts")
  @ApiOperation({
    summary: "Get word contexts",
    description: "Returns all text snippets where the user encountered this word.",
  })
  @ApiParam({ name: "lemmaId", description: "Lemma ID" })
  @ApiOkResponse({ description: "List of context entries with snippet and source text." })
  async getWordContexts(
    @Param("lemmaId") lemmaId: string,
    @User("id") userId: string,
  ) {
    return this.wordProgress.getWordContexts(userId, lemmaId);
  }
}
