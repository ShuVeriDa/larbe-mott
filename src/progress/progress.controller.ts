import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
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
import { RequiresPremium } from "src/auth/decorators/premium.decorator";
import { AnalyticsService } from "src/analytics/analytics.service";
import { User } from "src/user/decorators/user.decorator";
import { PrismaService } from "src/prisma.service";
import { TextProgressService } from "./text-progress/text-progress.service";
import { WordProgressService } from "./word-progress/word-progress.service";
import { SetTextPositionDto } from "./dto/set-text-position.dto";
import { SetWordStatusDto } from "./dto/set-word-status.dto";
import { SubmitReviewDto } from "./dto/submit-review.dto";

@ApiTags("progress")
@ApiBearerAuth()
@Controller("progress")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class ProgressController {
  constructor(
    private readonly textProgress: TextProgressService,
    private readonly wordProgress: WordProgressService,
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  // ─── text ────────────────────────────────────────────────────────────────────

  @Auth()
  @Get("text/:id")
  @ApiOperation({ summary: "Get progress for a text" })
  @ApiParam({ name: "id", description: "Text ID (UUID)" })
  @ApiOkResponse({ description: "Object with progress: number 0..100 (percentage)." })
  async getTextProgress(
    @Param("id", ParseUUIDPipe) textId: string,
    @User("id") userId: string,
  ) {
    const progress = await this.textProgress.calculateProgress(userId, textId);
    // Keep UserTextProgress cache in sync so statistics/list views stay consistent
    await this.textProgress.persistProgress(userId, textId, progress);
    return { progress };
  }

  @Auth()
  @Patch("text/:id/position")
  @ApiOperation({
    summary: "Save reading position",
    description:
      "Records the page the user is currently on. Position is monotonic — moves forward only, so revisiting earlier pages does not rewind the saved position. Used by 'Continue reading'.",
  })
  @ApiParam({ name: "id", description: "Text ID (UUID)" })
  @ApiOkResponse({
    description: "{ lastPageNumber: number, totalPages: number }",
  })
  async setTextPosition(
    @Param("id", ParseUUIDPipe) textId: string,
    @User("id") userId: string,
    @Body() dto: SetTextPositionDto,
  ) {
    return this.textProgress.setPosition(userId, textId, dto.pageNumber);
  }

  // ─── review stats ─────────────────────────────────────────────────────────────

  @Auth()
  @Get("review/stats")
  @ApiOperation({
    summary: "Get SM-2 review stats for the intro screen",
    description:
      "Returns dueCount (words to review today), learningCount (LEARNING status words), and streak (consecutive days).",
  })
  @ApiOkResponse({
    description: "{ dueCount: number, learningCount: number, streak: number }",
  })
  async getReviewStats(@User("id") userId: string) {
    const now = new Date();

    const [dueCount, learningCount, streakDetails] = await Promise.all([
      this.prisma.userWordProgress.count({
        where: {
          userId,
          status: { not: "KNOWN" },
          OR: [{ nextReview: null }, { nextReview: { lte: now } }],
        },
      }),
      this.prisma.userWordProgress.count({
        where: { userId, status: "LEARNING" },
      }),
      this.analyticsService.getStreakDetails(userId),
    ]);
    return { dueCount, learningCount, streak: streakDetails.current };
  }

  // ─── review — static route ABOVE the parameterized one ────────────────────────

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
    @Param("lemmaId", ParseUUIDPipe) lemmaId: string,
    @User("id") userId: string,
    @Body() dto: SubmitReviewDto,
  ) {
    return this.wordProgress.submitReview(userId, lemmaId, dto.quality);
  }

  // ─── words ───────────────────────────────────────────────────────────────────

  @Auth()
  @Patch("words/:lemmaId/status")
  @ApiOperation({
    summary: "Set word status manually",
    description:
      "Manually sets the learning status of a word from the reader. " +
      "NEW resets SM-2 state. LEARNING schedules the word for review today. " +
      "KNOWN marks the word as known and sets the next review in 21 days.",
  })
  @ApiParam({ name: "lemmaId", description: "Lemma ID" })
  @ApiOkResponse({ description: "Updated word progress record." })
  async setWordStatus(
    @Param("lemmaId", ParseUUIDPipe) lemmaId: string,
    @User("id") userId: string,
    @Body() dto: SetWordStatusDto,
  ) {
    return this.wordProgress.setWordStatus(userId, lemmaId, dto.status);
  }

  @RequiresPremium()
  @Get("words/:lemmaId/contexts")
  @ApiOperation({
    summary: "Get word contexts",
    description: "Returns text snippets where the user encountered this word. Paginated and filterable by text level. Requires Premium.",
  })
  @ApiParam({ name: "lemmaId", description: "Lemma ID" })
  @ApiQuery({ name: "page", required: false, description: "Page number (default 1)" })
  @ApiQuery({ name: "limit", required: false, description: "Items per page (default 20, max 100)" })
  @ApiQuery({ name: "level", required: false, description: "Filter by text CEFR level (A1..C2)" })
  @ApiOkResponse({ description: "{ items, total, page, limit }" })
  async getWordContexts(
    @Param("lemmaId", ParseUUIDPipe) lemmaId: string,
    @User("id") userId: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("level") level?: string,
  ) {
    return this.wordProgress.getWordContexts(userId, lemmaId, { page, limit, level });
  }

  @RequiresPremium()
  @Get("words/:lemmaId/calendar")
  @ApiOperation({
    summary: "Get review calendar for a word",
    description: "Returns last N days with status per day: done (review attempted), today, next (scheduled), empty. Default days=7. Requires Premium.",
  })
  @ApiParam({ name: "lemmaId", description: "Lemma ID" })
  @ApiQuery({ name: "days", required: false, description: "Number of days to return (default 7, max 30)" })
  @ApiOkResponse({ description: "[{ date: 'YYYY-MM-DD', status: 'done'|'empty'|'today'|'next' }]" })
  async getWordCalendar(
    @Param("lemmaId", ParseUUIDPipe) lemmaId: string,
    @User("id") userId: string,
    @Query("days") days?: string,
  ) {
    const parsed = parseInt(days ?? "", 10);
    const safeDays = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 30) : 7;
    return this.wordProgress.getWordCalendar(userId, lemmaId, safeDays);
  }
}
