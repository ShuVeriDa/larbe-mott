import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { PermissionCode, UserStatus } from "@prisma/client";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { User } from "src/user/decorators/user.decorator";
import { AdminUsersService } from "./admin-users.service";
import { AdminUserDetailsDto } from "./dto/admin-user-details.dto";
import { AdminUserListItemDto } from "./dto/admin-user-list-item.dto";
import { AdminUsersListResponseDto } from "./dto/admin-users-list-response.dto";
import { AssignRoleDto } from "./dto/assign-role.dto";
import { FetchUserEventsDto } from "./dto/fetch-user-events.dto";
import { FetchUserEventsSummaryDto } from "./dto/fetch-user-events-summary.dto";
import { FetchAdminUsersDto } from "./dto/fetch-admin-users.dto";

@ApiTags("admin/users")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@Controller("admin/users")
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Get()
  @ApiOperation({
    summary: "Get users list",
    description: "Fetch users with pagination, search and filters",
  })
  @ApiOkResponse({
    description: "Users fetched successfully",
    type: AdminUsersListResponseDto,
  })
  async getUsers(@Query() query: FetchAdminUsersDto) {
    return this.adminUsersService.getUsers(query);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Get(":id")
  @ApiOperation({
    summary: "Get user by ID",
    description:
      "Fetch user by ID with aggregated learning statistics and activity",
  })
  @ApiOkResponse({
    description: "User fetched successfully",
    type: AdminUserDetailsDto,
  })
  async getUserById(@Param("id") id: string) {
    return this.adminUsersService.getUserById(id);
  }

  @AdminPermission(PermissionCode.CAN_VIEW_ANALYTICS)
  @Get(":id/events")
  @ApiOperation({
    summary: "List user events",
    description:
      "Returns paginated user events with optional filters: type, dateFrom, dateTo.",
  })
  @ApiOkResponse({
    description: "Object with items[], total, page, limit, skip.",
  })
  async getUserEvents(
    @Param("id") id: string,
    @Query() query: FetchUserEventsDto,
  ) {
    return this.adminUsersService.getUserEvents(id, query);
  }

  @AdminPermission(PermissionCode.CAN_VIEW_ANALYTICS)
  @Get(":id/events/summary")
  @ApiOperation({
    summary: "User events summary",
    description:
      "Returns aggregated counters and top lists (e.g. FAIL_LOOKUP by normalized).",
  })
  @ApiOkResponse({
    description:
      "Summary object: counts by type + topFailLookups/topClicks arrays.",
  })
  async getUserEventsSummary(
    @Param("id") id: string,
    @Query() query: FetchUserEventsSummaryDto,
  ) {
    return this.adminUsersService.getUserEventsSummary(id, query);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Get(":id/roles")
  @ApiOperation({
    summary: "Get user roles",
    description: "Returns RBAC roles assigned to the user",
  })
  @ApiOkResponse({
    description: "List of roles (id, name)",
  })
  async getUserRoles(@Param("id") id: string) {
    return this.adminUsersService.getUserRoles(id);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Post(":id/roles")
  @ApiOperation({
    summary: "Assign role to user",
    description:
      "Assigns an RBAC role to the user (idempotency not guaranteed)",
  })
  @ApiOkResponse({
    description: "Updated list of roles for the user",
  })
  async assignRole(
    @Param("id") id: string,
    @Body() dto: AssignRoleDto,
    @User("id") assignedBy: string,
  ) {
    return this.adminUsersService.assignRole(id, dto.role, assignedBy);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Delete(":id/roles/:roleId")
  @ApiOperation({
    summary: "Revoke role from user",
    description: "Revokes an RBAC role assignment from the user",
  })
  @ApiOkResponse({
    description: "Updated list of roles for the user",
  })
  async revokeRole(@Param("id") id: string, @Param("roleId") roleId: string) {
    return this.adminUsersService.revokeRole(id, roleId);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Post(":id/block")
  @ApiOperation({
    summary: "Block user by ID",
    description: "Block user by ID",
  })
  @ApiOkResponse({
    description: "User blocked successfully",
    type: AdminUserListItemDto,
  })
  async blockUser(@Param("id") id: string) {
    return this.adminUsersService.updateUserStatus(id, {
      status: UserStatus.BLOCKED,
    });
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Post(":id/freeze")
  @ApiOperation({
    summary: "Freeze user by ID",
    description: "Freeze user by ID",
  })
  @ApiOkResponse({
    description: "User froze successfully",
    type: AdminUserListItemDto,
  })
  async frozenUser(@Param("id") id: string) {
    return this.adminUsersService.updateUserStatus(id, {
      status: UserStatus.FROZEN,
    });
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Post(":id/unblock")
  @ApiOperation({
    summary: "Unblock user by ID",
    description: "Unblock user by ID",
  })
  @ApiOkResponse({
    description: "User unblocked successfully",
    type: AdminUserListItemDto,
  })
  async activeUser(@Param("id") id: string) {
    return this.adminUsersService.updateUserStatus(id, {
      status: UserStatus.ACTIVE,
    });
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Post(":id/logout-all")
  @ApiOperation({
    summary: "Logout user from all sessions",
    description: "Invalidate all refresh tokens for the user",
  })
  @ApiOkResponse({
    description: "User logged out from all sessions successfully",
  })
  async logoutAllSessions(@Param("id") id: string) {
    await this.adminUsersService.logoutAllSessions(id);
    return true;
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Delete(":id")
  @ApiOperation({
    summary: "Delete user by ID",
    description: "Delete user by ID",
  })
  @ApiOkResponse({
    description: "User deleted successfully",
    type: AdminUserListItemDto,
  })
  async deleteUser(@Param("id") id: string) {
    return this.adminUsersService.deleteUser(id, {
      status: UserStatus.DELETED,
    });
  }
}
