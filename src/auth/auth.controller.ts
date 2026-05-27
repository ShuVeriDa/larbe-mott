import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  ParseUUIDPipe,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ErrorCode } from "src/common/errors/error-codes";
import { Throttle } from "@nestjs/throttler";
import { ConfigService } from "@nestjs/config";
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
} from "@nestjs/swagger";
import * as express from "express";

import { User } from "src/user/decorators/user.decorator";
import { LoginDto } from "src/user/dto/login.dto";

import { CreateUserDto } from "src/user/dto/create-user.dto";
import { AuthService } from "./auth.service";
import { Auth } from "./decorators/auth.decorator";
import { SessionId } from "./decorators/session-id.decorator";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ConfirmEmailChangeDto } from "./dto/confirm-email-change.dto";
import { ConfirmPasswordResetDto } from "./dto/confirm-password-reset.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { RequestEmailChangeDto } from "./dto/request-email-change.dto";
import { ValidatePasswordResetDto } from "./dto/validate-password-reset.dto";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post("login")
  @ApiOperation({ summary: "Authenticate user with credentials" })
  @ApiNotFoundResponse({ description: "The user not found" })
  @ApiUnauthorizedResponse({ description: "Invalid password" })
  @ApiOkResponse({ description: "Access and refresh tokens have been issued" })
  async login(
    @Body() dto: LoginDto,
    @Req() req: express.Request,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const { refreshToken, rememberMe, ...response } = await this.authService.login(dto, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    this.authService.addRefreshTokenResponse(res, refreshToken, rememberMe);

    return response;
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post("register")
  @ApiConflictResponse({
    description: "User with this username already exists",
  })
  @ApiOperation({ summary: "Register a new user account" })
  @ApiCreatedResponse({
    description: "User has been successfully registered",
  })
  async register(
    @Body() dto: CreateUserDto,
    @Req() req: express.Request,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const { refreshToken, ...response } = await this.authService.register(dto, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    this.authService.addRefreshTokenResponse(res, refreshToken);

    return response;
  }

  @HttpCode(200)
  @Post("login/access-token")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "Refresh access token using the refresh token" })
  @ApiOkResponse({
    description: "New access and refresh tokens have been issued",
  })
  async getNewTokens(
    @Req() req: express.Request,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const refreshTokenName =
      this.configService.getOrThrow<string>("REFRESH_TOKEN_NAME");

    const refreshTokenFromCookies = req.cookies[refreshTokenName];

    if (!refreshTokenFromCookies) {
      this.authService.removeRefreshTokenFromResponse(res);
      throw new UnauthorizedException({ code: ErrorCode.REFRESH_TOKEN_NOT_PASSED, message: "Refresh token not passed" });
    }

    const { refreshToken, rememberMe, ...response } = await this.authService.getNewTokens(
      refreshTokenFromCookies,
    );

    this.authService.addRefreshTokenResponse(res, refreshToken, rememberMe);

    return response;
  }

  @Auth()
  @Get("sessions")
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
  @ApiOperation({ summary: "Get active sessions for current user" })
  @ApiOkResponse({
    description:
      "List of active (non-revoked) sessions with parsed device label and isCurrent flag",
  })
  async getSessions(
    @User("id") userId: string,
    @SessionId() currentSessionId?: string,
  ) {
    return this.authService.getSessions(userId, currentSessionId);
  }

  @Auth()
  @HttpCode(200)
  @Delete("sessions")
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
  @ApiOperation({
    summary:
      "Revoke all sessions for current user except the current one (matches the design 'End all')",
  })
  @ApiOkResponse({
    description:
      "Returns { success: true, revoked: <count> }. The current session is preserved.",
  })
  async revokeAllSessions(
    @User("id") userId: string,
    @SessionId() currentSessionId?: string,
  ) {
    return this.authService.revokeAllSessions(userId, currentSessionId);
  }

  @Auth()
  @HttpCode(200)
  @Delete("sessions/:id")
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
  @ApiNotFoundResponse({ description: "Session not found" })
  @ApiBadRequestResponse({ description: "Session already revoked" })
  @ApiOperation({ summary: "Revoke a specific session" })
  @ApiOkResponse({ description: "Session revoked successfully" })
  async revokeSession(
    @Param("id", ParseUUIDPipe) sessionId: string,
    @User("id") userId: string,
  ) {
    return this.authService.revokeSession(sessionId, userId);
  }

  /* ──────────────────────────────────────────────────────────────
     PASSWORD RESET — public endpoints
     ────────────────────────────────────────────────────────────── */

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(200)
  @Post("password-reset/request")
  @ApiOperation({
    summary: "Request a password reset link (always returns ok=true)",
  })
  @ApiOkResponse({ description: "{ ok: true } — regardless of whether the email exists" })
  async requestPasswordReset(
    @Body() dto: ForgotPasswordDto,
    @Req() req: express.Request,
  ) {
    await this.authService.requestPasswordReset(dto.email, dto.lang ?? "ru", {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    return { ok: true };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post("password-reset/validate")
  @ApiOperation({
    summary:
      "Validate a password reset token (for the badge on the /reset-password page)",
  })
  @ApiOkResponse({
    description:
      "{ valid: true, expiresAt, email: 'u***@example.com' } | { valid: false, reason }",
  })
  async validatePasswordReset(@Body() dto: ValidatePasswordResetDto) {
    return this.authService.validatePasswordResetToken(dto.token);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post("password-reset/confirm")
  @ApiOperation({
    summary:
      "Set a new password via token + revoke all sessions + email notification",
  })
  @ApiOkResponse({ description: "{ ok: true } — password saved successfully" })
  @ApiBadRequestResponse({
    description: "weak_password | token_expired | account_unavailable",
  })
  @ApiNotFoundResponse({ description: "token_invalid" })
  @ApiConflictResponse({ description: "token_used" })
  async confirmPasswordReset(
    @Body() dto: ConfirmPasswordResetDto,
    @Query("lang") lang: string | undefined,
    @Req() req: express.Request,
  ) {
    const safeLang =
      lang === "ru" || lang === "che" || lang === "en" || lang === "ar"
        ? lang
        : "ru";
    await this.authService.confirmPasswordReset(dto.token, dto.password, {
      ip: req.ip,
      lang: safeLang,
    });
    return { ok: true };
  }

  /* ──────────────────────────────────────────────────────────────
     PASSWORD CHANGE — authenticated flow (current → new)
     ────────────────────────────────────────────────────────────── */

  @Auth()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post("password/change")
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({
    description: "Missing/invalid bearer token OR invalid_current_password",
  })
  @ApiBadRequestResponse({
    description: "weak_password | same_password",
  })
  @ApiOperation({
    summary:
      "Change password for an authenticated user. Requires current + new password. Terminates all sessions and sends a notification email.",
  })
  @ApiOkResponse({ description: "{ ok: true } — password changed successfully" })
  async changePassword(
    @User("id") userId: string,
    @Body() dto: ChangePasswordDto,
    @Req() req: express.Request,
  ) {
    await this.authService.changePassword(
      userId,
      dto.currentPassword,
      dto.newPassword,
      { ip: req.ip, lang: dto.lang ?? "ru" },
    );
    return { ok: true };
  }

  /* ──────────────────────────────────────────────────────────────
     EMAIL CHANGE — two steps: request (to new email) + confirm
     ────────────────────────────────────────────────────────────── */

  @Auth()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(200)
  @Post("email-change/request")
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({
    description: "Missing/invalid bearer token OR invalid_current_password",
  })
  @ApiBadRequestResponse({ description: "same_email" })
  @ApiConflictResponse({ description: "email_taken — the specified email is already taken" })
  @ApiOperation({
    summary:
      "Request an email change. A confirmation link is sent to the NEW address.",
  })
  @ApiOkResponse({ description: "{ ok: true } — confirmation email sent to the new address" })
  async requestEmailChange(
    @User("id") userId: string,
    @Body() dto: RequestEmailChangeDto,
    @Req() req: express.Request,
  ) {
    return this.authService.requestEmailChange(
      userId,
      dto.newEmail,
      dto.currentPassword,
      dto.lang ?? "ru",
      { ip: req.ip, userAgent: req.headers["user-agent"] },
    );
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post("email-change/confirm")
  @ApiOperation({
    summary:
      "Confirm the new email via token. Terminates all sessions, sends a notification to the old address.",
  })
  @ApiOkResponse({ description: "{ ok: true, email } — email changed successfully" })
  @ApiBadRequestResponse({ description: "token_expired | account_unavailable" })
  @ApiNotFoundResponse({ description: "token_invalid" })
  @ApiConflictResponse({ description: "token_used | email_taken" })
  async confirmEmailChange(
    @Body() dto: ConfirmEmailChangeDto,
    @Query("lang") lang: string | undefined,
    @Req() req: express.Request,
  ) {
    const safeLang =
      lang === "ru" || lang === "che" || lang === "en" || lang === "ar"
        ? lang
        : "ru";
    return this.authService.confirmEmailChange(dto.token, {
      ip: req.ip,
      lang: safeLang,
    });
  }

  @Auth()
  @HttpCode(200)
  @Post("logout")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Invalidate refresh token and logout" })
  @ApiOkResponse({ description: "Logout completed successfully" })
  async logout(
    @User("id") userId: string,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    await this.authService.logout(userId);
    this.authService.removeRefreshTokenFromResponse(res);

    return true;
  }
}
