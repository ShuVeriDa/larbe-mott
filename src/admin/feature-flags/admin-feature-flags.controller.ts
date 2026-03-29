import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
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
import { PermissionCode } from "@prisma/client";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { User } from "src/user/decorators/user.decorator";
import { AdminFeatureFlagsService } from "./admin-feature-flags.service";
import { CreateFeatureFlagDto } from "./dto/create-feature-flag.dto";
import { CreateFeatureFlagOverrideDto } from "./dto/create-feature-flag-override.dto";
import { DuplicateFeatureFlagDto } from "./dto/duplicate-feature-flag.dto";
import { FetchFeatureFlagHistoryDto } from "./dto/fetch-feature-flag-history.dto";
import { FetchFeatureFlagOverridesDto } from "./dto/fetch-feature-flag-overrides.dto";
import { FetchFeatureFlagsDto } from "./dto/fetch-feature-flags.dto";
import { ImportFeatureFlagsDto } from "./dto/import-feature-flags.dto";
import { UpdateFeatureFlagDto } from "./dto/update-feature-flag.dto";
import { SetUserFeatureFlagDto } from "./dto/set-user-feature-flag.dto";
import { ToggleFeatureFlagDto } from "./dto/toggle-feature-flag.dto";

@ApiTags("admin/feature-flags")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@Controller("admin/feature-flags")
export class AdminFeatureFlagsController {
  constructor(private readonly flags: AdminFeatureFlagsService) {}

  @AdminPermission(PermissionCode.CAN_MANAGE_FEATURE_FLAGS)
  @Get("stats")
  @ApiOperation({ summary: "Feature flags dashboard stats" })
  @ApiOkResponse({ description: "Aggregated stats for admin feature flags page." })
  getStats() {
    return this.flags.getStats();
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_FEATURE_FLAGS)
  @Get("overrides")
  @ApiOperation({ summary: "List per-user flag overrides" })
  @ApiOkResponse({ description: "Paginated override records with user + flag info." })
  getOverrides(@Query() query: FetchFeatureFlagOverridesDto) {
    return this.flags.getOverrides(query);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_FEATURE_FLAGS)
  @Post("overrides")
  @ApiOperation({ summary: "Create or update override by payload" })
  @ApiOkResponse({ description: "Created or updated override." })
  createOverride(
    @Body() dto: CreateFeatureFlagOverrideDto,
    @User("id") actorId: string,
  ) {
    return this.flags.createOverride(dto, actorId);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_FEATURE_FLAGS)
  @Delete("overrides/:overrideId")
  @ApiOperation({ summary: "Delete override by override id" })
  @ApiOkResponse({ description: "Deleted." })
  deleteOverride(
    @Param("overrideId") overrideId: string,
    @User("id") actorId: string,
  ) {
    return this.flags.deleteOverride(overrideId, actorId);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_FEATURE_FLAGS)
  @Get("history")
  @ApiOperation({ summary: "List feature flag history" })
  @ApiOkResponse({ description: "Paginated history timeline." })
  getHistory(@Query() query: FetchFeatureFlagHistoryDto) {
    return this.flags.getHistory(query);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_FEATURE_FLAGS)
  @Post("import")
  @ApiOperation({ summary: "Import flags from JSON payload" })
  @ApiOkResponse({ description: "Import summary." })
  importFlags(@Body() dto: ImportFeatureFlagsDto, @User("id") actorId: string) {
    return this.flags.importFlags(dto, actorId);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_FEATURE_FLAGS)
  @Get()
  @ApiOperation({ summary: "List global feature flags" })
  @ApiOkResponse({ description: "Paginated feature flags list for global tab." })
  getFlags(@Query() query: FetchFeatureFlagsDto) {
    return this.flags.getFlags(query);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_FEATURE_FLAGS)
  @Post()
  @ApiOperation({ summary: "Create feature flag" })
  @ApiOkResponse({ description: "Created feature flag." })
  createFlag(@Body() dto: CreateFeatureFlagDto, @User("id") actorId: string) {
    return this.flags.createFlag(dto, actorId);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_FEATURE_FLAGS)
  @Patch(":id")
  @ApiOperation({ summary: "Update feature flag" })
  @ApiOkResponse({ description: "Updated feature flag." })
  updateFlag(
    @Param("id") id: string,
    @Body() dto: UpdateFeatureFlagDto,
    @User("id") actorId: string,
  ) {
    return this.flags.updateFlag(id, dto, actorId);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_FEATURE_FLAGS)
  @Patch(":id/toggle")
  @ApiOperation({ summary: "Toggle global feature flag state" })
  @ApiOkResponse({ description: "Updated feature flag." })
  toggleFlag(
    @Param("id") id: string,
    @Body() dto: ToggleFeatureFlagDto,
    @User("id") actorId: string,
  ) {
    return this.flags.toggleFlag(id, dto.isEnabled, actorId);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_FEATURE_FLAGS)
  @Post(":id/duplicate")
  @ApiOperation({ summary: "Duplicate feature flag with new key" })
  @ApiOkResponse({ description: "Duplicated feature flag." })
  duplicateFlag(
    @Param("id") id: string,
    @Body() dto: DuplicateFeatureFlagDto,
    @User("id") actorId: string,
  ) {
    return this.flags.duplicateFlag(id, dto.key, actorId);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_FEATURE_FLAGS)
  @Get(":id/history")
  @ApiOperation({ summary: "Get timeline for single flag" })
  @ApiOkResponse({ description: "Recent changes for selected flag." })
  getFlagHistory(
    @Param("id") id: string,
    @Query("limit", new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.flags.getFlagHistory(id, limit);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_FEATURE_FLAGS)
  @Delete(":id")
  @ApiOperation({ summary: "Delete feature flag (soft delete)" })
  @ApiOkResponse({ description: "Deleted." })
  deleteFlag(@Param("id") id: string, @User("id") actorId: string) {
    return this.flags.deleteFlag(id, actorId);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_FEATURE_FLAGS)
  @Post(":id/users")
  @ApiOperation({ summary: "Set per-user feature flag override" })
  @ApiOkResponse({ description: "Created/updated user override." })
  setUserOverride(
    @Param("id") id: string,
    @Body() dto: SetUserFeatureFlagDto,
    @User("id") actorId: string,
  ) {
    return this.flags.setUserOverride(id, dto.userId, dto.isEnabled, dto.reason, actorId);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_FEATURE_FLAGS)
  @Delete(":id/users/:userId")
  @ApiOperation({ summary: "Delete per-user feature flag override" })
  @ApiOkResponse({ description: "Deleted." })
  deleteUserOverride(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @User("id") actorId: string,
  ) {
    return this.flags.deleteUserOverride(id, userId, actorId);
  }
}

