import { Controller, Get, NotFoundException, Param, Query, Res } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { PermissionCode } from "@prisma/client";
import type { Response } from "express";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { AdminLogsService } from "./admin-logs.service";
import {
  AdminLogsExportFormat,
  FetchAdminLogsDto,
} from "./dto/fetch-admin-logs.dto";

@ApiTags("admin/logs")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@Controller("admin/logs")
export class AdminLogsController {
  constructor(private readonly logsService: AdminLogsService) {}

  @AdminPermission(PermissionCode.CAN_VIEW_LOGS)
  @Get()
  @ApiOperation({
    summary: "System logs list",
    description:
      "Returns paginated logs for /admin/logs with search, service/level filters, tabs and date range.",
  })
  @ApiOkResponse({ description: "{ items, total, page, limit, skip, tabs }" })
  getLogs(@Query() query: FetchAdminLogsDto): Promise<unknown> {
    return this.logsService.getLogs(query);
  }

  @AdminPermission(PermissionCode.CAN_VIEW_LOGS)
  @Get("stats")
  @ApiOperation({
    summary: "System logs KPI stats",
    description:
      "Returns KPI cards for logs page: total events, errors, warnings, avg response and error rate.",
  })
  @ApiOkResponse({ description: "Stats payload with trends and tabs counters." })
  getStats(@Query() query: FetchAdminLogsDto): Promise<unknown> {
    return this.logsService.getStats(query);
  }

  @AdminPermission(PermissionCode.CAN_VIEW_LOGS)
  @Get("live")
  @ApiOperation({
    summary: "Live logs updates",
    description:
      "Returns a batch of logs newer than the cursor timestamp (`since`) for live mode polling.",
  })
  @ApiOkResponse({ description: "{ items, nextCursor }" })
  getLive(@Query() query: FetchAdminLogsDto): Promise<unknown> {
    return this.logsService.getLive(query);
  }

  @AdminPermission(PermissionCode.CAN_VIEW_LOGS)
  @Get("export")
  @ApiOperation({
    summary: "Export logs",
    description:
      "Exports logs matching current filters. Add ?format=csv for CSV download.",
  })
  @ApiOkResponse({ description: "JSON payload or CSV file response." })
  async exportLogs(
    @Query() query: FetchAdminLogsDto,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.logsService.exportLogs(
      query,
      query.format ?? AdminLogsExportFormat.JSON,
    );
    if (result.format === AdminLogsExportFormat.CSV) {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`);
      res.send(result.content);
      return;
    }
    res.json({
      fileName: result.fileName,
      format: result.format,
      data: JSON.parse(result.content),
    });
  }

  @AdminPermission(PermissionCode.CAN_VIEW_LOGS)
  @Get(":id")
  @ApiOperation({
    summary: "System log details",
    description: "Returns complete details for one log row.",
  })
  @ApiOkResponse({ description: "Single log details payload." })
  async getById(@Param("id") id: string): Promise<unknown> {
    const data = await this.logsService.getById(id);
    if (!data) {
      throw new NotFoundException(`Log ${id} not found`);
    }
    return data;
  }
}
