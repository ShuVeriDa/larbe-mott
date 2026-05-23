import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { PermissionCode } from "@prisma/client";
import { Auth } from "src/auth/decorators/auth.decorator";
import { PermissionsService } from "src/auth/permissions/permissions.service";
import { User } from "./decorators/user.decorator";
import { DeleteAccountDto } from "./dto/delete-account.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UserResponseDto } from "./dto/user-response.dto";
import { UserService } from "./user.service";

@ApiTags("users")
@ApiBearerAuth()
@Controller("users")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get("me")
  @Auth()
  @ApiOperation({
    summary: "Get current user profile",
    description:
      "Returns the authenticated user's profile without needing to know their ID. Used by the homepage greeting, header, etc.",
  })
  @ApiOkResponse({ type: UserResponseDto })
  async getMe(@User("id") userId: string) {
    return this.userService.getUserById(userId);
  }

  @Get(":id")
  @Auth()
  @ApiOperation({ summary: "Get user profile by identifier" })
  @ApiParam({ name: "id", description: "User identifier" })
  @ApiNotFoundResponse({
    description: "The user not found",
  })
  @ApiOkResponse({ description: "Returns user profile data" })
  async getUserById(
    @Param("id", ParseUUIDPipe) userId: string,
    @User("id") currentUserId: string,
  ) {
    const isAdmin = await this.permissionsService.hasPermission(
      currentUserId,
      PermissionCode.CAN_MANAGE_USERS,
    );
    if (!isAdmin && userId !== currentUserId) {
      throw new ForbiddenException("Access denied");
    }
    return this.userService.getUserById(userId);
  }

  @HttpCode(201)
  @Auth()
  @Patch()
  @ApiOperation({ summary: "Update user profile fields" })
  @ApiOkResponse({ description: "User profile updated successfully" })
  async updateUser(@Body() dto: UpdateUserDto, @User("id") userId: string) {
    return this.userService.updateUser(dto, userId);
  }

  @HttpCode(200)
  @Auth()
  @Delete()
  @ApiOperation({
    summary:
      "Schedule current account for deletion (soft-delete with 30-day grace period)",
    description:
      "Requires confirmation by entering the current account's email in the request body. " +
      "The account is marked status=DELETED, deletedAt=now(), and all active sessions are revoked. " +
      "After 30 days the data is permanently deleted by a background job.",
  })
  @ApiNotFoundResponse({ description: "The user not found" })
  @ApiOkResponse({
    description:
      "Account scheduled for deletion. Returns { success: true, message }.",
  })
  async deleteUser(
    @User("id") userId: string,
    @Body() dto: DeleteAccountDto,
  ) {
    return this.userService.deleteUser(userId, dto);
  }
}
