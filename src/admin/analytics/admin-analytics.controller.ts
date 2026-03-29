import { Controller, Get, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { PermissionCode } from "@prisma/client";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { AdminAnalyticsService } from "./admin-analytics.service";
import {
  AnalyticsExportFormat,
  DifficultTextsTab,
  FetchAdminAnalyticsDto,
  PopularTextsTab,
} from "./dto/fetch-admin-analytics.dto";

@ApiTags("admin/analytics")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@Controller("admin/analytics")
export class AdminAnalyticsController {
  constructor(private readonly analytics: AdminAnalyticsService) {}

  @AdminPermission(PermissionCode.CAN_VIEW_ANALYTICS)
  @Get()
  @ApiOperation({
    summary: "Admin analytics overview",
    description:
      "Returns full payload for /admin/analytics: KPI, levels, heatmap, events, tops, " +
      "funnel and SM-2 metrics with selected period filters.",
  })
  @ApiOkResponse({ description: "Complete analytics payload for admin analytics page." })
  getOverview(@Query() query: FetchAdminAnalyticsDto): Promise<unknown> {
    return this.analytics.getOverview(query);
  }

  @AdminPermission(PermissionCode.CAN_VIEW_ANALYTICS)
  @Get("export")
  @ApiOperation({
    summary: "Export analytics payload",
    description:
      "Exports analytics in JSON or CSV format for the selected filters.",
  })
  @ApiOkResponse({ description: "Export data with generated filename." })
  exportAnalytics(@Query() query: FetchAdminAnalyticsDto): Promise<unknown> {
    return this.analytics.exportOverview(query, query.format ?? AnalyticsExportFormat.JSON);
  }

  @AdminPermission(PermissionCode.CAN_VIEW_ANALYTICS)
  @Get("difficult-texts")
  @ApiOperation({
    summary: "Difficult texts list",
    description: "Returns difficult texts by fail / unknown percent / abandon tab.",
  })
  @ApiOkResponse({ description: "Difficult texts list for selected tab." })
  getDifficultTexts(@Query() query: FetchAdminAnalyticsDto): Promise<unknown> {
    return this.analytics.getDifficultTextsEndpoint(
      query,
      query.difficultBy ?? DifficultTextsTab.FAIL,
    );
  }

  @AdminPermission(PermissionCode.CAN_VIEW_ANALYTICS)
  @Get("popular-texts")
  @ApiOperation({
    summary: "Popular texts list",
    description: "Returns popular texts by opens / completions / saved words tab.",
  })
  @ApiOkResponse({ description: "Popular texts list for selected tab." })
  getPopularTexts(@Query() query: FetchAdminAnalyticsDto): Promise<unknown> {
    return this.analytics.getPopularTextsEndpoint(
      query,
      query.popularBy ?? PopularTextsTab.OPENS,
    );
  }

  @AdminPermission(PermissionCode.CAN_VIEW_ANALYTICS)
  @Get("texts/complexity")
  @ApiOperation({
    summary: "Complex texts (many FAIL_LOOKUP)",
    description:
      "Returns texts ranked by FAIL_LOOKUP events count, optionally limited by date range.",
  })
  @ApiOkResponse({ description: "Array of { textId, failLookupCount }." })
  getComplexTexts(
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("limit") limit?: string,
  ) {
    return this.analytics.getComplexTexts({
      dateFrom,
      dateTo,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @AdminPermission(PermissionCode.CAN_VIEW_ANALYTICS)
  @Get("levels/popular")
  @ApiOperation({
    summary: "Popular levels",
    description:
      "Returns OPEN_TEXT counts grouped by Text.level, optionally limited by date range.",
  })
  @ApiOkResponse({ description: "Array of { level, openCount }." })
  getPopularLevels(
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
  ) {
    return this.analytics.getPopularLevels({ dateFrom, dateTo });
  }
}

