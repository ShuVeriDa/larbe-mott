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
}
