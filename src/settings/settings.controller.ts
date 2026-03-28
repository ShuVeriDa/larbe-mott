import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Res,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Response } from "express";
import { Auth } from "src/auth/decorators/auth.decorator";
import { User } from "src/user/decorators/user.decorator";
import { UpdateGoalsDto } from "./dto/update-goals.dto";
import { UpdateNotificationsDto } from "./dto/update-notifications.dto";
import { UpdatePreferencesDto } from "./dto/update-preferences.dto";
import { SettingsService } from "./settings.service";

@ApiTags("settings")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@Auth()
@Controller("settings")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // ─── GET ALL ─────────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: "Get all user settings" })
  @ApiOkResponse({ description: "preferences, goals, notifications" })
  getAll(@User("id") userId: string) {
    return this.settingsService.getAll(userId);
  }

  // ─── PREFERENCES ─────────────────────────────────────────────────────────────

  @Patch("preferences")
  @ApiOperation({ summary: "Update appearance and reader preferences" })
  @ApiOkResponse({ description: "Updated preferences record" })
  updatePreferences(
    @User("id") userId: string,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.settingsService.updatePreferences(userId, dto);
  }

  // ─── GOALS ───────────────────────────────────────────────────────────────────

  @Patch("goals")
  @ApiOperation({ summary: "Update daily learning goals" })
  @ApiOkResponse({ description: "Updated goals record" })
  updateGoals(
    @User("id") userId: string,
    @Body() dto: UpdateGoalsDto,
  ) {
    return this.settingsService.updateGoals(userId, dto);
  }

  // ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

  @Patch("notifications")
  @ApiOperation({ summary: "Update email notification preferences" })
  @ApiOkResponse({ description: "Updated notifications record" })
  updateNotifications(
    @User("id") userId: string,
    @Body() dto: UpdateNotificationsDto,
  ) {
    return this.settingsService.updateNotifications(userId, dto);
  }

  // ─── EXPORT ──────────────────────────────────────────────────────────────────

  @Get("export/vocabulary")
  @ApiOperation({ summary: "Export personal vocabulary as JSON" })
  @ApiOkResponse({ description: "Array of dictionary entries" })
  exportVocabulary(@User("id") userId: string) {
    return this.settingsService.exportVocabulary(userId);
  }

  @Get("export/progress")
  @ApiOperation({ summary: "Export reading & word progress as JSON" })
  @ApiOkResponse({ description: "Object with textProgress, wordProgress, reviewLogs" })
  exportProgress(@User("id") userId: string) {
    return this.settingsService.exportProgress(userId);
  }

  // ─── RESET ───────────────────────────────────────────────────────────────────

  @Post("reset/progress")
  @HttpCode(200)
  @ApiOperation({ summary: "Reset all reading progress" })
  @ApiOkResponse({ description: "{ success: true }" })
  resetProgress(@User("id") userId: string) {
    return this.settingsService.resetReadingProgress(userId);
  }

  @Post("reset/vocabulary")
  @HttpCode(200)
  @ApiOperation({ summary: "Clear personal vocabulary" })
  @ApiOkResponse({ description: "{ success: true }" })
  resetVocabulary(@User("id") userId: string) {
    return this.settingsService.clearVocabulary(userId);
  }
}
