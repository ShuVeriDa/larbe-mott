import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Res,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { PermissionCode, UserStatus } from "@prisma/client";
import type { Response } from "express";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { User } from "src/user/decorators/user.decorator";
import { AdminUsersService } from "./admin-users.service";
import { AdminUserDetailsDto } from "./dto/admin-user-details.dto";
import { AdminUserListItemDto } from "./dto/admin-user-list-item.dto";
import { AdminUsersListResponseDto } from "./dto/admin-users-list-response.dto";
import { ApplyCouponDto } from "./dto/apply-coupon.dto";
import { AssignRoleDto } from "./dto/assign-role.dto";
import { BulkUsersActionDto } from "./dto/bulk-users-action.dto";
import { ExtendSubscriptionDto } from "./dto/extend-subscription.dto";
import { FetchAdminUsersDto } from "./dto/fetch-admin-users.dto";
import { FetchUserEventsDto } from "./dto/fetch-user-events.dto";
import { FetchUserEventsSummaryDto } from "./dto/fetch-user-events-summary.dto";
import { SetFeatureFlagOverrideDto } from "./dto/set-feature-flag-override.dto";

@ApiTags("admin/users")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@Controller("admin/users")
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  // ─── Stats (before /:id) ──────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Get("stats")
  @ApiOperation({ summary: "Get users stats" })
  @ApiOkResponse({
    description:
      "total, active, activePercent, blocked, frozen, deleted, newThisMonth, withPaidSubscription",
  })
  async getStats() {
    return this.adminUsersService.getStats();
  }

  // ─── Export (before /:id) ─────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Get("export")
  @ApiOperation({
    summary: "Export users",
    description:
      "Export users matching current filters. Add ?format=csv for a CSV file download.",
  })
  @ApiOkResponse({ description: "JSON array or CSV file" })
  async exportUsers(@Query() query: FetchAdminUsersDto, @Res() res: Response) {
    const result = await this.adminUsersService.exportUsers(query);
    if (result.format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="users.csv"');
      res.send(result.data);
    } else {
      res.json(result.data);
    }
  }

  // ─── Bulk actions (before /:id) ───────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Post("bulk/freeze")
  @HttpCode(200)
  @ApiOperation({
    summary: "Bulk freeze users",
    description: "Freeze multiple ACTIVE users at once",
  })
  @ApiOkResponse({ description: "{ updated: number }" })
  async bulkFreeze(@Body() dto: BulkUsersActionDto) {
    return this.adminUsersService.bulkFreeze(dto);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Post("bulk/block")
  @HttpCode(200)
  @ApiOperation({
    summary: "Bulk block users",
    description: "Block multiple ACTIVE or FROZEN users at once",
  })
  @ApiOkResponse({ description: "{ updated: number }" })
  async bulkBlock(@Body() dto: BulkUsersActionDto) {
    return this.adminUsersService.bulkBlock(dto);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Post("bulk/reset-roles")
  @HttpCode(200)
  @ApiOperation({
    summary: "Bulk reset user roles",
    description: "Remove all RBAC role assignments from selected users",
  })
  @ApiOkResponse({ description: "{ deletedAssignments: number }" })
  async bulkResetRoles(@Body() dto: BulkUsersActionDto) {
    return this.adminUsersService.bulkResetRoles(dto);
  }

  // ─── List ─────────────────────────────────────────────────────────────────────

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

  // ─── Single user ──────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Get(":id")
  @ApiOperation({
    summary: "Get user by ID",
    description:
      "Fetch user by ID with aggregated learning statistics, roles, active subscription and activity",
  })
  @ApiOkResponse({ description: "User fetched successfully", type: AdminUserDetailsDto })
  async getUserById(@Param("id") id: string) {
    return this.adminUsersService.getUserById(id);
  }

  // ─── Events ───────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_VIEW_ANALYTICS)
  @Get(":id/events")
  @ApiOperation({
    summary: "List user events",
    description:
      "Returns paginated user events with optional filters: type, dateFrom, dateTo.",
  })
  @ApiOkResponse({ description: "{ items[], total, page, limit, skip }" })
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
    description: "Summary object: counts by type + topFailLookups/topClicks arrays.",
  })
  async getUserEventsSummary(
    @Param("id") id: string,
    @Query() query: FetchUserEventsSummaryDto,
  ) {
    return this.adminUsersService.getUserEventsSummary(id, query);
  }

  // ─── Roles ────────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Get(":id/roles")
  @ApiOperation({
    summary: "Get user roles",
    description: "Returns RBAC roles assigned to the user with assignment date",
  })
  @ApiOkResponse({ description: "List of roles (id, name, assignedAt)" })
  async getUserRoles(@Param("id") id: string) {
    return this.adminUsersService.getUserRoles(id);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Post(":id/roles")
  @HttpCode(200)
  @ApiOperation({
    summary: "Assign role to user",
    description: "Assigns an RBAC role to the user",
  })
  @ApiOkResponse({ description: "Updated list of roles for the user" })
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
  @ApiOkResponse({ description: "Updated list of roles for the user" })
  async revokeRole(@Param("id") id: string, @Param("roleId") roleId: string) {
    return this.adminUsersService.revokeRole(id, roleId);
  }

  // ─── Sessions ─────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Get(":id/sessions")
  @ApiOperation({
    summary: "Get user sessions",
    description: "Returns up to 50 most recent sessions (active + revoked)",
  })
  @ApiOkResponse({ description: "Array of session items (id, ipAddress, userAgent, createdAt, revokedAt, isActive)" })
  async getUserSessions(@Param("id") id: string) {
    return this.adminUsersService.getUserSessions(id);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Post(":id/logout-all")
  @HttpCode(200)
  @ApiOperation({
    summary: "Logout user from all sessions",
    description: "Invalidates refresh token and revokes all active UserSession records",
  })
  @ApiOkResponse({ description: "true" })
  async logoutAllSessions(@Param("id") id: string) {
    await this.adminUsersService.logoutAllSessions(id);
    return true;
  }

  // ─── Subscription ─────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Get(":id/subscription")
  @ApiOperation({
    summary: "Get user subscription",
    description: "Returns current active subscription and payment history (last 20 payments)",
  })
  @ApiOkResponse({ description: "{ current, paymentHistory[] }" })
  async getUserSubscription(@Param("id") id: string) {
    return this.adminUsersService.getUserSubscription(id);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Post(":id/subscriptions/:subId/cancel")
  @HttpCode(200)
  @ApiOperation({
    summary: "Cancel subscription",
    description: "Sets subscription status to CANCELED and records canceledAt",
  })
  @ApiOkResponse({ description: "Updated subscription response" })
  async cancelSubscription(
    @Param("id") id: string,
    @Param("subId") subId: string,
  ) {
    return this.adminUsersService.cancelSubscription(id, subId);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Post(":id/subscriptions/:subId/extend")
  @HttpCode(200)
  @ApiOperation({
    summary: "Extend subscription",
    description: "Manually adds N days to subscription endDate",
  })
  @ApiOkResponse({ description: "Updated subscription response" })
  async extendSubscription(
    @Param("id") id: string,
    @Param("subId") subId: string,
    @Body() dto: ExtendSubscriptionDto,
  ) {
    return this.adminUsersService.extendSubscription(id, subId, dto);
  }

  // ─── Feature flags ────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_FEATURE_FLAGS)
  @Get(":id/feature-flags")
  @ApiOperation({
    summary: "Get user feature flag overrides",
    description:
      "Returns all global feature flags merged with this user's overrides. " +
      "effectiveValue = userOverride ?? globalValue",
  })
  @ApiOkResponse({ description: "Array of UserFeatureFlagItemDto" })
  async getUserFeatureFlags(@Param("id") id: string) {
    return this.adminUsersService.getUserFeatureFlags(id);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_FEATURE_FLAGS)
  @Put(":id/feature-flags/:flagId")
  @ApiOperation({
    summary: "Set feature flag override for user",
    description: "Creates or updates a per-user override for the given feature flag",
  })
  @ApiOkResponse({ description: "Updated list of feature flags for the user" })
  async setFeatureFlagOverride(
    @Param("id") id: string,
    @Param("flagId") flagId: string,
    @Body() dto: SetFeatureFlagOverrideDto,
  ) {
    return this.adminUsersService.setFeatureFlagOverride(id, flagId, dto);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_FEATURE_FLAGS)
  @Delete(":id/feature-flags/:flagId")
  @ApiOperation({
    summary: "Delete feature flag override for user",
    description: "Removes the per-user override, reverting to the global flag value",
  })
  @ApiOkResponse({ description: "Updated list of feature flags for the user" })
  async deleteFeatureFlagOverride(
    @Param("id") id: string,
    @Param("flagId") flagId: string,
  ) {
    return this.adminUsersService.deleteFeatureFlagOverride(id, flagId);
  }

  // ─── Coupon ───────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Post(":id/apply-coupon")
  @HttpCode(200)
  @ApiOperation({
    summary: "Apply coupon to user",
    description:
      "Manually redeems a coupon for the user. Validates isActive, validity dates and redemption limits.",
  })
  @ApiOkResponse({ description: "{ success: true, couponId, code }" })
  async applyCoupon(@Param("id") id: string, @Body() dto: ApplyCouponDto) {
    return this.adminUsersService.applyCoupon(id, dto);
  }

  // ─── Status mutations ─────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Post(":id/block")
  @HttpCode(200)
  @ApiOperation({ summary: "Block user by ID" })
  @ApiOkResponse({ description: "User blocked successfully", type: AdminUserListItemDto })
  async blockUser(@Param("id") id: string) {
    return this.adminUsersService.updateUserStatus(id, { status: UserStatus.BLOCKED });
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Post(":id/unblock")
  @HttpCode(200)
  @ApiOperation({ summary: "Unblock user by ID", description: "Sets user status back to ACTIVE" })
  @ApiOkResponse({ description: "User unblocked successfully", type: AdminUserListItemDto })
  async unblockUser(@Param("id") id: string) {
    return this.adminUsersService.updateUserStatus(id, { status: UserStatus.ACTIVE });
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Post(":id/freeze")
  @HttpCode(200)
  @ApiOperation({ summary: "Freeze user by ID" })
  @ApiOkResponse({ description: "User frozen successfully", type: AdminUserListItemDto })
  async freezeUser(@Param("id") id: string) {
    return this.adminUsersService.updateUserStatus(id, { status: UserStatus.FROZEN });
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Post(":id/unfreeze")
  @HttpCode(200)
  @ApiOperation({ summary: "Unfreeze user by ID", description: "Sets user status back to ACTIVE" })
  @ApiOkResponse({ description: "User unfrozen successfully", type: AdminUserListItemDto })
  async unfreezeUser(@Param("id") id: string) {
    return this.adminUsersService.updateUserStatus(id, { status: UserStatus.ACTIVE });
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Delete(":id")
  @ApiOperation({ summary: "Delete user by ID" })
  @ApiOkResponse({ description: "User deleted successfully", type: AdminUserListItemDto })
  async deleteUser(@Param("id") id: string) {
    return this.adminUsersService.deleteUser(id, { status: UserStatus.DELETED });
  }
}
