import { Controller, Get, Query, Res } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { PermissionCode } from "@prisma/client";
import type { Response } from "express";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { AdminDashboardService } from "./admin-dashboard.service";
import { DashboardQueryDto } from "./dto/dashboard-query.dto";

@ApiTags("admin/dashboard")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@Controller("admin/dashboard")
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get()
  @AdminPermission(PermissionCode.CAN_VIEW_ANALYTICS)
  @ApiOperation({
    summary: "Admin dashboard — aggregated platform statistics",
    description:
      "Returns KPI cards, registrations chart, content stats, recent users, " +
      "activity feed, support summary, and billing summary. " +
      "Use `period` (week|month|year|all) or custom `dateFrom`/`dateTo` to filter time-based metrics.",
  })
  @ApiOkResponse({ description: "Full dashboard payload" })
  getDashboard(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getDashboard(query);
  }

  @Get("export")
  @AdminPermission(PermissionCode.CAN_VIEW_ANALYTICS)
  @ApiOperation({
    summary: "Export dashboard snapshot",
    description:
      "Downloads the dashboard payload for the selected period as JSON (default) or CSV. " +
      "Accepts the same `period`/`dateFrom`/`dateTo` query params as `GET /admin/dashboard`.",
  })
  @ApiQuery({
    name: "format",
    required: false,
    enum: ["json", "csv"],
    description: "Output format (default: json)",
  })
  @ApiOkResponse({ description: "File download." })
  async export(
    @Query() query: DashboardQueryDto,
    @Query("format") format: "json" | "csv" | undefined,
    @Res() res: Response,
  ) {
    const stamp = Date.now();
    if (format === "csv") {
      const csv = await this.dashboardService.exportCsv(query);
      res
        .setHeader("Content-Type", "text/csv; charset=utf-8")
        .setHeader(
          "Content-Disposition",
          `attachment; filename="admin-dashboard-${stamp}.csv"`,
        )
        .send("﻿" + csv);
      return;
    }
    const data = await this.dashboardService.getDashboard(query);
    res
      .setHeader("Content-Type", "application/json")
      .setHeader(
        "Content-Disposition",
        `attachment; filename="admin-dashboard-${stamp}.json"`,
      )
      .json(data);
  }
}
