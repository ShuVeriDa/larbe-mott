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
  UseGuards,
} from "@nestjs/common";
import { ErrorCode } from "src/common/errors/error-codes";
import { Throttle } from "@nestjs/throttler";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { AuthGuard } from "@nestjs/passport";
import { AuthProvider } from "@prisma/client";
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
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
import { TelegramLoginDto } from "./dto/telegram-login.dto";
import { ValidatePasswordResetDto } from "./dto/validate-password-reset.dto";
import { GoogleProfile } from "./strategies/google.strategy";
import { createOAuthState, verifyOAuthState } from "./utils/oauth-state.util";

const OAUTH_STATE_COOKIE = "oauth_state";
const VALID_LANGS = ["ru", "che", "en", "ar"] as const;
type ValidLang = (typeof VALID_LANGS)[number];

const isValidLang = (lang: unknown): lang is ValidLang =>
  typeof lang === "string" && (VALID_LANGS as readonly string[]).includes(lang);

const ACCESS_TOKEN_COOKIE = "access_token";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
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
    this.authService.addAccessTokenResponse(res, response.accessToken, rememberMe);

    return response;
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post("restore")
  @ApiOperation({
    summary:
      "Restore a soft-deleted account and log in, if still within the deletion grace period. Requires re-entering username + password — not gated behind an existing session, since a deleted account has none.",
  })
  @ApiUnauthorizedResponse({ description: "Invalid credentials" })
  @ApiBadRequestResponse({ description: "not_scheduled_for_deletion" })
  @ApiForbiddenResponse({ description: "restore_grace_period_expired" })
  @ApiOkResponse({ description: "Account restored, access and refresh tokens have been issued" })
  async restore(
    @Body() dto: LoginDto,
    @Req() req: express.Request,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const { refreshToken, rememberMe, ...response } = await this.authService.restoreAccountAndLogin(dto, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    this.authService.addRefreshTokenResponse(res, refreshToken, rememberMe);
    this.authService.addAccessTokenResponse(res, response.accessToken, rememberMe);

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
    this.authService.addAccessTokenResponse(res, response.accessToken);

    return response;
  }

  /* ──────────────────────────────────────────────────────────────
     GOOGLE OAUTH — redirect flow with stateless CSRF protection
     ────────────────────────────────────────────────────────────── */

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get("google")
  @ApiOperation({ summary: "Redirect to Google OAuth consent screen with CSRF state" })
  googleAuth(
    @Query("lang") lang: string | undefined,
    @Query("intent") intent: string | undefined,
    @Res() res: express.Response,
  ) {
    const safeLang = isValidLang(lang) ? lang : "ru";
    const safeIntent = intent === "link" ? "link" : "login";
    const stateSecret = this.configService.getOrThrow<string>("OAUTH_STATE_SECRET");
    const state = createOAuthState(safeLang, stateSecret, safeIntent);

    // Короткоживущая cookie (5 минут) — переживает только сам OAuth round-trip.
    res.cookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      maxAge: 5 * 60 * 1000,
      secure: this.authService.shouldUseSecureCookies(),
      sameSite: "lax", // lax — cookie должна пережить top-level redirect от Google обратно
      path: "/api/auth/google",
    });

    const clientId = this.configService.getOrThrow<string>("GOOGLE_CLIENT_ID");
    const callbackUrl = this.configService.getOrThrow<string>("GOOGLE_CALLBACK_URL");
    const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    googleAuthUrl.searchParams.set("client_id", clientId);
    googleAuthUrl.searchParams.set("redirect_uri", callbackUrl);
    googleAuthUrl.searchParams.set("response_type", "code");
    googleAuthUrl.searchParams.set("scope", "email profile");
    googleAuthUrl.searchParams.set("state", state);

    return res.redirect(googleAuthUrl.toString());
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get("google/callback")
  @UseGuards(AuthGuard("google"))
  @ApiOperation({ summary: "Google OAuth callback — verifies state, issues session cookies, redirects to frontend" })
  async googleCallback(
    @Req() req: express.Request & { user: GoogleProfile },
    @Query("state") state: string | undefined,
    @Res() res: express.Response,
  ) {
    const frontendUrl = (this.configService.get<string>("FRONTEND_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
    const stateCookie = req.cookies[OAUTH_STATE_COOKIE] as string | undefined;
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/api/auth/google" });

    // CSRF-проверка: state из query ДОЛЖЕН совпадать со state, который мы сами
    // положили в cookie перед редиректом на Google. Иначе — отказ, это может
    // быть попытка login-CSRF (навязанный код авторизации от чужого сеанса).
    const stateSecret = this.configService.getOrThrow<string>("OAUTH_STATE_SECRET");
    const verified = state && stateCookie === state ? verifyOAuthState(state, stateSecret) : null;

    if (!verified) {
      return res.redirect(`${frontendUrl}/ru/auth?error=oauth_state_mismatch`);
    }

    const lang = isValidLang(verified.lang) ? verified.lang : "ru";

    if (verified.intent === "link") {
      return this.handleGoogleLinkCallback(req, res, frontendUrl, lang);
    }

    try {
      const { refreshToken, rememberMe, ...response } = await this.authService.loginWithOAuthProfile(
        AuthProvider.GOOGLE,
        req.user,
        { ip: req.ip, userAgent: req.headers["user-agent"] },
      );

      this.authService.addRefreshTokenResponse(res, refreshToken, rememberMe);
      this.authService.addAccessTokenResponse(res, response.accessToken, rememberMe);

      return res.redirect(`${frontendUrl}/${lang}/dashboard`);
    } catch {
      // Не палим причину отказа в URL — фронт покажет generic-сообщение.
      return res.redirect(`${frontendUrl}/${lang}/auth?error=oauth_failed`);
    }
  }

  /**
   * Linking из уже активной сессии — не создаёт новую сессию/токены (в отличие
   * от login-веток), только добавляет Account к req.user.id из проверенного
   * access_token cookie. Опциональная ручная JWT-проверка (не второй Guard):
   * невалидный/отсутствующий cookie здесь — отказ (в отличие от login-режима,
   * где это нормальный случай), поскольку без активной сессии линковать не к кому.
   */
  private async handleGoogleLinkCallback(
    req: express.Request & { user: GoogleProfile },
    res: express.Response,
    frontendUrl: string,
    lang: ValidLang,
  ) {
    const accessToken = req.cookies[ACCESS_TOKEN_COOKIE] as string | undefined;
    if (!accessToken) {
      return res.redirect(`${frontendUrl}/${lang}/auth?error=oauth_failed`);
    }

    try {
      const payload = await this.jwtService.verifyAsync<{ id: string }>(accessToken, {
        secret: this.configService.getOrThrow<string>("JWT_ACCESS_SECRET"),
      });
      await this.authService.linkGoogleAccount(payload.id, req.user);
      return res.redirect(`${frontendUrl}/${lang}/profile?linked=google`);
    } catch {
      // Истёкший/невалидный access_token ИЛИ Google-аккаунт уже привязан
      // к другому пользователю — оба случая получают общий generic-редирект,
      // не раскрывая причину отказа через URL.
      return res.redirect(`${frontendUrl}/${lang}/auth?error=oauth_failed`);
    }
  }

  /* ──────────────────────────────────────────────────────────────
     LINKED ACCOUNTS — manage OAuth providers from an active session
     ────────────────────────────────────────────────────────────── */

  @Auth()
  @Get("linked-accounts")
  @ApiBearerAuth()
  @ApiOperation({ summary: "List OAuth accounts linked to the current user, and whether a password is set" })
  async getLinkedAccounts(@User("id") userId: string) {
    return this.authService.getLinkedAccounts(userId);
  }

  @Auth()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Delete("linked-accounts/:id")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Unlink an OAuth account (rejected if it's the only sign-in method)" })
  async unlinkAccount(
    @User("id") userId: string,
    @Param("id", ParseUUIDPipe) accountId: string,
  ) {
    return this.authService.unlinkAccount(userId, accountId);
  }

  /* ──────────────────────────────────────────────────────────────
     TELEGRAM LOGIN WIDGET — hash-based verification, not OAuth2 redirect
     ────────────────────────────────────────────────────────────── */

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post("telegram")
  @ApiOperation({ summary: "Log in or register via Telegram Login Widget data" })
  async telegramLogin(
    @Body() dto: TelegramLoginDto,
    @Req() req: express.Request,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const { refreshToken, rememberMe, ...response } = await this.authService.loginWithTelegram(dto, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    this.authService.addRefreshTokenResponse(res, refreshToken, rememberMe);
    this.authService.addAccessTokenResponse(res, response.accessToken, rememberMe);
    return response;
  }

  @Auth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post("telegram/link")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Link a Telegram account to the current authenticated session" })
  async linkTelegram(
    @User("id") userId: string,
    @Body() dto: TelegramLoginDto,
  ) {
    return this.authService.linkTelegramAccount(userId, dto);
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

    let tokens: Awaited<ReturnType<typeof this.authService.getNewTokens>>;
    try {
      tokens = await this.authService.getNewTokens(refreshTokenFromCookies);
    } catch (err) {
      this.authService.removeRefreshTokenFromResponse(res);
      this.authService.removeAccessTokenFromResponse(res);
      throw err;
    }

    const { refreshToken, rememberMe, ...response } = tokens;

    this.authService.addRefreshTokenResponse(res, refreshToken, rememberMe);
    this.authService.addAccessTokenResponse(res, response.accessToken, rememberMe);

    return { ...response, rememberMe };
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
    this.authService.removeAccessTokenFromResponse(res);

    return true;
  }
}
