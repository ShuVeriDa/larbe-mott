import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { RequiresPremium } from "src/auth/decorators/premium.decorator";
import { User } from "src/user/decorators/user.decorator";
import { StatisticsService } from "./statistics.service";
import { StatisticsQueryDto, StatPeriod } from "./dto/statistics-query.dto";
import { LogReadingDto } from "./dto/log-reading.dto";
import { LogReviewSessionDto } from "./dto/log-review-session.dto";

@ApiTags("statistics")
@ApiBearerAuth()
@Controller("statistics")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get("me")
  @RequiresPremium()
  @ApiOperation({
    summary: "Get personal statistics",
    description:
      "Returns full learning analytics for the /statistics page: header metrics, streak, year heatmap, " +
      "word progress donut, words-per-day chart, texts progress list, review accuracy, and recent activity. " +
      "Supports period filtering: week | month | year | all. Requires Premium.",
  })
  @ApiOkResponse({
    description:
      "{ period, header, streak, heatmap, words, wordsPerDay, texts, accuracy, recentActivity }",
  })
  async getMyStatistics(
    @User("id") userId: string,
    @Query() query: StatisticsQueryDto,
  ) {
    return this.statisticsService.getUserStatistics(userId, query.period ?? StatPeriod.MONTH);
  }

  @Post("reading-time")
  @RequiresPremium()
  @ApiOperation({
    summary: "Log a reading session",
    description:
      "Records time spent reading a text (in seconds). Call this when the user leaves a page or finishes a reading session. Requires Premium.",
  })
  @ApiOkResponse({ description: "{ ok: true }" })
  async logReadingTime(
    @User("id") userId: string,
    @Body() dto: LogReadingDto,
  ) {
    await this.statisticsService.logReadingSession(userId, dto.textId, dto.durationSeconds);
    return { ok: true };
  }

  @Post("review-session")
  @RequiresPremium()
  @ApiOperation({
    summary: "Log a completed review session",
    description:
      "Records the summary of a spaced-repetition session (correct/wrong counts). " +
      "Call this after the user finishes a full review session. Requires Premium.",
  })
  @ApiOkResponse({ description: "{ ok: true }" })
  async logReviewSession(
    @User("id") userId: string,
    @Body() dto: LogReviewSessionDto,
  ) {
    await this.statisticsService.logReviewSession(userId, dto.correct, dto.wrong);
    return { ok: true };
  }
}
