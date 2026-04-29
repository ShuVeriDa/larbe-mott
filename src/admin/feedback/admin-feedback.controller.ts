import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PermissionCode } from "@prisma/client";
import type { Response } from "express";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { User } from "src/user/decorators/user.decorator";
import { AdminFeedbackService } from "./admin-feedback.service";
import { AdminReplyDto } from "./dto/admin-reply.dto";
import { AssignFeedbackDto } from "./dto/assign-feedback.dto";
import {
  ExportAdminFeedbackDto,
  FeedbackExportFormat,
} from "./dto/export-feedback.dto";
import { FetchAdminFeedbackDto } from "./dto/fetch-admin-feedback.dto";
import { TransferFeedbackDto } from "./dto/transfer-feedback.dto";
import { UpdateFeedbackPriorityDto } from "./dto/update-priority.dto";
import { UpdateFeedbackStatusDto } from "./dto/update-status.dto";

@ApiTags("admin/feedback")
@ApiBearerAuth()
@Controller("admin/feedback")
export class AdminFeedbackController {
  constructor(private readonly adminFeedbackService: AdminFeedbackService) {}

  @Get("stats")
  @AdminPermission(PermissionCode.CAN_MANAGE_FEEDBACK)
  @ApiOperation({ summary: "Feedback stats: total, by status, by type" })
  getStats() {
    return this.adminFeedbackService.getStats();
  }

  @Get("assignees")
  @AdminPermission(PermissionCode.CAN_MANAGE_FEEDBACK)
  @ApiOperation({
    summary: "List admin users eligible for thread assignment",
    description: "Returns users with SUPPORT, ADMIN or SUPERADMIN role",
  })
  @ApiOkResponse({ description: "Flat list of admin users (id, name, surname, username, email, roles[])" })
  getAssignees() {
    return this.adminFeedbackService.getAssignees();
  }

  @Get("export")
  @AdminPermission(PermissionCode.CAN_MANAGE_FEEDBACK)
  @ApiOperation({
    summary: "Export feedback threads",
    description: "Export threads matching the filters. Add ?format=csv for CSV file download.",
  })
  @ApiOkResponse({ description: "JSON array or CSV file" })
  async exportThreads(@Query() dto: ExportAdminFeedbackDto, @Res() res: Response) {
    const result = await this.adminFeedbackService.exportThreads(dto);
    if (result.format === FeedbackExportFormat.CSV) {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="feedback.csv"');
      res.send(result.data);
    } else {
      res.json(result.data);
    }
  }

  @Get()
  @AdminPermission(PermissionCode.CAN_MANAGE_FEEDBACK)
  @ApiOperation({ summary: "List all feedback threads with filters" })
  getThreads(@Query() dto: FetchAdminFeedbackDto) {
    return this.adminFeedbackService.getThreads(dto);
  }

  @Get(":threadId")
  @AdminPermission(PermissionCode.CAN_MANAGE_FEEDBACK)
  @ApiOperation({ summary: "Get thread detail with messages and context" })
  getThread(@Param("threadId") threadId: string) {
    return this.adminFeedbackService.getThread(threadId);
  }

  @Patch(":threadId/status")
  @AdminPermission(PermissionCode.CAN_MANAGE_FEEDBACK)
  @ApiOperation({ summary: "Change thread status" })
  updateStatus(
    @Param("threadId") threadId: string,
    @Body() dto: UpdateFeedbackStatusDto,
  ) {
    return this.adminFeedbackService.updateStatus(threadId, dto);
  }

  @Patch(":threadId/priority")
  @AdminPermission(PermissionCode.CAN_MANAGE_FEEDBACK)
  @ApiOperation({ summary: "Change thread priority" })
  updatePriority(
    @Param("threadId") threadId: string,
    @Body() dto: UpdateFeedbackPriorityDto,
  ) {
    return this.adminFeedbackService.updatePriority(threadId, dto);
  }

  @Patch(":threadId/assignee")
  @AdminPermission(PermissionCode.CAN_MANAGE_FEEDBACK)
  @ApiOperation({ summary: "Assign/unassign thread to admin" })
  updateAssignee(
    @User("id") adminId: string,
    @Param("threadId") threadId: string,
    @Body() dto: AssignFeedbackDto,
  ) {
    return this.adminFeedbackService.updateAssignee(adminId, threadId, dto);
  }

  @Patch(":threadId/read")
  @AdminPermission(PermissionCode.CAN_MANAGE_FEEDBACK)
  @ApiOperation({ summary: "Mark all user messages in thread as read by admin" })
  markAsReadByAdmin(@Param("threadId") threadId: string) {
    return this.adminFeedbackService.markAsReadByAdmin(threadId);
  }

  @Post(":threadId/messages")
  @AdminPermission(PermissionCode.CAN_MANAGE_FEEDBACK)
  @ApiOperation({
    summary: "Reply to user or add internal note (reply sets status to ANSWERED)",
  })
  reply(
    @User("id") adminId: string,
    @Param("threadId") threadId: string,
    @Body() dto: AdminReplyDto,
  ) {
    return this.adminFeedbackService.reply(adminId, threadId, dto);
  }

  @Post(":threadId/transfer")
  @AdminPermission(PermissionCode.CAN_MANAGE_FEEDBACK)
  @ApiOperation({ summary: "Transfer thread to another admin" })
  transfer(
    @User("id") adminId: string,
    @Param("threadId") threadId: string,
    @Body() dto: TransferFeedbackDto,
  ) {
    return this.adminFeedbackService.transfer(adminId, threadId, dto);
  }

  @Delete(":threadId")
  @AdminPermission(PermissionCode.CAN_MANAGE_FEEDBACK)
  @ApiOperation({
    summary: "Delete thread permanently",
    description: "Hard-deletes the thread together with all its messages",
  })
  deleteThread(@Param("threadId") threadId: string) {
    return this.adminFeedbackService.deleteThread(threadId);
  }
}
