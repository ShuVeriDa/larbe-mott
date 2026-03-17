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

@ApiTags("admin/analytics")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@Controller("admin/analytics")
export class AdminAnalyticsController {
  constructor(private readonly analytics: AdminAnalyticsService) {}

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

