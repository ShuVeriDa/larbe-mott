import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PermissionCode } from "@prisma/client";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { User } from "src/user/decorators/user.decorator";
import { AdminFeedbackService } from "./admin-feedback.service";
import { AdminReplyDto } from "./dto/admin-reply.dto";
import { FetchAdminFeedbackDto } from "./dto/fetch-admin-feedback.dto";
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
  @ApiOperation({ summary: "Change thread status (new → in_progress → resolved)" })
  updateStatus(
    @Param("threadId") threadId: string,
    @Body() dto: UpdateFeedbackStatusDto,
  ) {
    return this.adminFeedbackService.updateStatus(threadId, dto);
  }

  @Post(":threadId/messages")
  @AdminPermission(PermissionCode.CAN_MANAGE_FEEDBACK)
  @ApiOperation({ summary: "Reply to user (sets status to IN_PROGRESS)" })
  reply(
    @User("id") adminId: string,
    @Param("threadId") threadId: string,
    @Body() dto: AdminReplyDto,
  ) {
    return this.adminFeedbackService.reply(adminId, threadId, dto);
  }
}
