import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { PermissionCode } from "@prisma/client";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { AdminFeatureFlagsService } from "./admin-feature-flags.service";
import { CreateFeatureFlagDto } from "./dto/create-feature-flag.dto";
import { UpdateFeatureFlagDto } from "./dto/update-feature-flag.dto";
import { SetUserFeatureFlagDto } from "./dto/set-user-feature-flag.dto";

@ApiTags("admin/feature-flags")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@Controller("admin/feature-flags")
export class AdminFeatureFlagsController {
  constructor(private readonly flags: AdminFeatureFlagsService) {}

  @AdminPermission(PermissionCode.CAN_MANAGE_FEATURE_FLAGS)
  @Get()
  @ApiOperation({ summary: "List feature flags" })
  @ApiOkResponse({ description: "Array of feature flags with user overrides." })
  getFlags() {
    return this.flags.getFlags();
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_FEATURE_FLAGS)
  @Post()
  @ApiOperation({ summary: "Create feature flag" })
  @ApiOkResponse({ description: "Created feature flag." })
  createFlag(@Body() dto: CreateFeatureFlagDto) {
    return this.flags.createFlag(dto);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_FEATURE_FLAGS)
  @Patch(":id")
  @ApiOperation({ summary: "Update feature flag" })
  @ApiOkResponse({ description: "Updated feature flag." })
  updateFlag(@Param("id") id: string, @Body() dto: UpdateFeatureFlagDto) {
    return this.flags.updateFlag(id, dto);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_FEATURE_FLAGS)
  @Post(":id/users")
  @ApiOperation({ summary: "Set per-user feature flag override" })
  @ApiOkResponse({ description: "Created/updated user override." })
  setUserOverride(@Param("id") id: string, @Body() dto: SetUserFeatureFlagDto) {
    return this.flags.setUserOverride(id, dto.userId, dto.isEnabled);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_FEATURE_FLAGS)
  @Delete(":id/users/:userId")
  @ApiOperation({ summary: "Delete per-user feature flag override" })
  @ApiOkResponse({ description: "Deleted." })
  deleteUserOverride(@Param("id") id: string, @Param("userId") userId: string) {
    return this.flags.deleteUserOverride(id, userId);
  }
}

