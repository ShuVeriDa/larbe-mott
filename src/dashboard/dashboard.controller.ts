import { Controller, Get } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Auth } from "src/auth/decorators/auth.decorator";
import { User } from "src/user/decorators/user.decorator";
import { DashboardService } from "./dashboard.service";

@ApiTags("dashboard")
@ApiBearerAuth()
@Controller("dashboard")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Auth()
  @Get("me")
  @ApiOperation({
    summary: "Get dashboard data",
    description:
      "Returns all data needed for the main dashboard: stats (textsRead, wordsInDictionary, streak, streakDays, dueToday breakdown, words breakdown), continue reading list, and current plan snapshot for the sidebar plan badge.",
  })
  @ApiOkResponse({
    description:
      "stats, continueReading, plan, sections: { recentTexts, popularTexts, shortTexts, byLevelTexts, userLevel }. " +
      "All text sections are pre-fetched server-side to avoid waterfall requests from the client.",
  })
  async getDashboard(@User("id") userId: string) {
    return this.dashboardService.getDashboard(userId);
  }
}
