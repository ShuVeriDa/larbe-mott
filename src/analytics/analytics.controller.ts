import { Controller, Get } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { RequiresPremium } from "src/auth/decorators/premium.decorator";
import { User } from "src/user/decorators/user.decorator";
import { AnalyticsService } from "./analytics.service";

@ApiTags("analytics")
@Controller("analytics")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("me")
  @RequiresPremium()
  @ApiOperation({
    summary: "Get personal learning analytics",
    description:
      "Returns word stats, streak, due-today count, text progress, and a 30-day activity chart. Requires Premium subscription.",
  })
  @ApiOkResponse({
    description:
      "words (total/new/learning/known), dueToday, texts (opened/avgProgress), streak (days), activity (date + count per day)",
  })
  async getMyAnalytics(@User("id") userId: string) {
    return this.analyticsService.getUserAnalytics(userId);
  }
}
