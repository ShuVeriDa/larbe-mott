import { Controller, Get } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { User } from "src/user/decorators/user.decorator";
import { DashboardService } from "./dashboard.service";

@ApiTags("dashboard")
@ApiBearerAuth()
@Controller("dashboard")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("me")
  @ApiOperation({
    summary: "Get dashboard data",
    description:
      "Returns all data needed for the main dashboard: stats (textsRead, wordsInDictionary, streak, dueToday, words breakdown) and continue reading list.",
  })
  @ApiOkResponse({
    description:
      "stats: { textsRead, wordsInDictionary, streak, dueToday, words }, continueReading: []",
  })
  async getDashboard(@User("id") userId: string) {
    return this.dashboardService.getDashboard(userId);
  }
}
