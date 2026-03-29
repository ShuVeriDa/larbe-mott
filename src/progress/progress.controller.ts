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
import { User } from "src/user/decorators/user.decorator";
import { PrismaService } from "src/prisma.service";
import { TextProgressService } from "./text-progress/text-progress.service";
import { WordProgressService } from "./word-progress/word-progress.service";
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
    return { progress };
  }

  // ─── review stats ─────────────────────────────────────────────────────────────

  @RequiresPremium()
  @Get("review/stats")
  @ApiOperation({
    summary: "Get SM-2 review stats for the intro screen",
    description:
      "Returns dueCount (words to review today), learningCount (LEARNING status words), and streak (consecutive days). Requires Premium.",
  })
  @ApiOkResponse({
    description: "{ dueCount: number, learningCount: number, streak: number }",
  })
  async getReviewStats(@User("id") userId: string) {
    const now = new Date();

    const [dueCount, learningCount, streakEvents] = await Promise.all([
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
      this.prisma.userEvent.findMany({
        where: { userId },
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const streak = this.calcStreak(streakEvents.map((e) => e.createdAt));

    return { dueCount, learningCount, streak };
  }

  // ─── review — статичный маршрут ВЫШЕ параметрического ────────────────────────

  @RequiresPremium()
  @Get("review/due")
  @ApiOperation({
    summary: "Get words due for review",
    description: "Returns words scheduled for spaced repetition review today. Requires Premium.",
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

  @RequiresPremium()
  @Post("review/:lemmaId")
  @ApiOperation({
    summary: "Submit word review result",
    description: "Processes SM-2 algorithm with quality score (0-5). 0-2 = fail, 3-5 = pass. Requires Premium.",
  })
  @ApiParam({ name: "lemmaId", description: "Lemma ID" })
  @ApiOkResponse({ description: "Updated word progress record." })
  async submitReview(
    @Param("lemmaId", ParseUUIDPipe) lemmaId: string,
    @User("id") userId: string,
    @Body() dto: SubmitReviewDto,
  ) {
    const [result] = await Promise.all([
      this.wordProgress.submitReview(userId, lemmaId, dto.quality),
      this.prisma.userReviewLog.create({
        data: { userId, lemmaId, quality: dto.quality, correct: dto.quality >= 3 },
      }),
    ]);
    return result;
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
    description: "Returns all text snippets where the user encountered this word. Requires Premium.",
  })
  @ApiParam({ name: "lemmaId", description: "Lemma ID" })
  @ApiOkResponse({ description: "List of context entries with snippet and source text." })
  async getWordContexts(
    @Param("lemmaId", ParseUUIDPipe) lemmaId: string,
    @User("id") userId: string,
  ) {
    return this.wordProgress.getWordContexts(userId, lemmaId);
  }

  // ─── helpers ─────────────────────────────────────────────────────────────────

  private calcStreak(dates: Date[]): number {
    if (!dates.length) return 0;

    const uniqueDays = [
      ...new Set(dates.map((d) => d.toISOString().slice(0, 10))),
    ].sort().reverse();

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

    if (uniqueDays[0] !== today && uniqueDays[0] !== yesterday) return 0;

    let streak = 0;
    let expected = uniqueDays[0];

    for (const day of uniqueDays) {
      if (day === expected) {
        streak++;
        const d = new Date(expected);
        d.setDate(d.getDate() - 1);
        expected = d.toISOString().slice(0, 10);
      } else {
        break;
      }
    }

    return streak;
  }
}
