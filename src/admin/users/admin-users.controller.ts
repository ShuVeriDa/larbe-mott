import { Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { UserStatus } from "@prisma/client";
import { Admin } from "src/auth/decorators/admin.decorator";
import { AdminUsersService } from "./admin-users.service";
import { AdminUserListItemDto } from "./dto/admin-user-list-item.dto";
import { AdminUserDetailsDto } from "./dto/admin-user-details.dto";
import { AdminUsersListResponseDto } from "./dto/admin-users-list-response.dto";
import { FetchUsersDto } from "./dto/fetch-users.dto";

@ApiTags("admin/users")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@Controller("admin/users")
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Admin()
  @Get()
  @ApiOperation({
    summary: "Get users list",
    description: "Fetch users with pagination, search and filters",
  })
  @ApiOkResponse({
    description: "Users fetched successfully",
    type: AdminUsersListResponseDto,
  })
  async getUsers(@Query() query: FetchUsersDto) {
    return this.adminUsersService.getUsers(query);
  }

  @Admin()
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

  @Admin()
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

  @Admin()
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

  @Admin()
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

  @Admin()
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

  @Admin()
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
