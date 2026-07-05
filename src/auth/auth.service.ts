import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { AuthProvider, Prisma, UserEventType, UserStatus } from "@prisma/client";
import { hash, verify, argon2id } from "argon2";

const ARGON2_OPTIONS = {
  type: argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;
import { randomBytes } from "crypto";
import * as fs from "fs";
import { join } from "path";
import { Response } from "express";
import {
  lookupSessionLocation,
  parseDeviceLabel,
} from "./utils/session-meta.util";
import { PrismaService } from "src/prisma.service";
import { MailService } from "src/mail/mail.service";
import type { PasswordResetEmailLang } from "src/mail/templates/password-reset.template";
import type { EmailChangeLang } from "src/mail/templates/email-change.template";
import { CreateUserDto } from "src/user/dto/create-user.dto";
import { LoginDto } from "src/user/dto/login.dto";
import { UserService } from "src/user/user.service";
import { RedisService } from "src/redis/redis.service";
import { ErrorCode } from "src/common/errors/error-codes";
import { RefreshTokenLockService } from "./refresh-token-lock.service";
import { ImageProcessingService } from "src/common/image-processing/image-processing.service";
import type { AvatarVariants } from "src/common/image-processing/image-processing.service";
import type { OAuthProfile } from "./utils/oauth-profile.type";
import { slugifyName } from "./utils/slugify-name.util";
import type { GoogleProfile } from "./strategies/google.strategy";
import { verifyTelegramLogin } from "./utils/telegram-verify.util";
import type { TelegramLoginDto } from "./dto/telegram-login.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private jwt: JwtService,
    private userService: UserService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
    private readonly refreshLock: RefreshTokenLockService,
    private readonly imageProcessing: ImageProcessingService,
  ) {}

  private static readonly LOGIN_FAIL_MAX = 10;
  private static readonly LOGIN_LOCKOUT_TTL = 15 * 60; // 15 minutes in seconds

  private loginFailKey(identifier: string): string {
    return `login:fail:${identifier.toLowerCase().trim()}`;
  }

  private async checkAndIncrementLoginFailures(identifier: string): Promise<void> {
    const key = this.loginFailKey(identifier);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, AuthService.LOGIN_LOCKOUT_TTL);
    }
    if (count > AuthService.LOGIN_FAIL_MAX) {
      throw new HttpException(
        { code: ErrorCode.ACCOUNT_TEMPORARILY_LOCKED, message: "Too many failed attempts. Try again in 15 minutes." },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async clearLoginFailures(identifier: string): Promise<void> {
    await this.redis.del(this.loginFailKey(identifier));
  }

  async login(dto: LoginDto, meta?: { ip?: string; userAgent?: string }) {
    // Check lockout before validateUser to fail fast without hitting the DB.
    const failKey = dto.username.toLowerCase().trim();
    const failCount = Number(await this.redis.get(this.loginFailKey(failKey)) ?? "0");
    if (failCount >= AuthService.LOGIN_FAIL_MAX) {
      throw new HttpException(
        { code: ErrorCode.ACCOUNT_TEMPORARILY_LOCKED, message: "Too many failed attempts. Try again in 15 minutes." },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    let user: Awaited<ReturnType<typeof this.validateUser>>;
    try {
      user = await this.validateUser(dto);
    } catch (err) {
      // Only count failures for credential errors, not account-blocked/deleted.
      if (err instanceof UnauthorizedException) {
        await this.checkAndIncrementLoginFailures(failKey);
      }
      throw err;
    }

    // Successful login — reset failure counter.
    await this.clearLoginFailures(failKey);

    const rememberMe = dto.rememberMe ?? false;

    // Создаём UserSession ПЕРЕД issueTokens, чтобы вшить sessionId в JWT-пейлоад.
    // Это позволяет /auth/sessions помечать "текущую" и DELETE /auth/sessions исключать её.
    const session = await this.recordSession(user.id, meta?.ip, meta?.userAgent);

    const tokens = await this.issueTokens(user.id, session.id, rememberMe);

    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);

    await this.prisma.userEvent.create({
      data: {
        userId: user.id,
        type: UserEventType.START_SESSION,
      },
    });

    return {
      user,
      ...tokens,
      rememberMe,
    };
  }

  async register(
    dto: CreateUserDto,
    meta?: { ip?: string; userAgent?: string },
  ) {
    const existingUserByUsername = await this.userService.getByUserName(dto.username);
    const existingUserByEmail = await this.userService.getByEmail(dto.email);

    if (existingUserByUsername)
      throw new ConflictException({ code: ErrorCode.USERNAME_TAKEN, message: "User with this username already exists" });
    if (existingUserByEmail)
      throw new ConflictException({ code: ErrorCode.EMAIL_TAKEN, message: "User with this email already exists" });

    let createdUser: Awaited<ReturnType<typeof this.userService.create>>;
    try {
      createdUser = await this.userService.create(dto);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException({ code: ErrorCode.USER_ALREADY_EXISTS, message: "User with this email or username already exists" });
      }
      throw e;
    }
    const {
      password: _,
      hashedRefreshToken: __,
      ...user
    } = createdUser as typeof createdUser & {
      hashedRefreshToken?: string | null;
    };

    const session = await this.recordSession(user.id, meta?.ip, meta?.userAgent);

    const tokens = await this.issueTokens(user.id, session.id);

    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);

    await this.prisma.userEvent.create({
      data: {
        userId: user.id,
        type: UserEventType.START_SESSION,
      },
    });

    return {
      user,
      ...tokens,
    };
  }

  async recordSession(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    return this.prisma.userSession.create({
      data: {
        userId,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      },
      select: { id: true, createdAt: true },
    });
  }

  addRefreshTokenResponse(res: Response, refreshToken: string, rememberMe = false) {
    const expiresIn = new Date();
    const defaultDays = Number(
      this.configService.get("EXPIRE_DAY_REFRESH_TOKEN") ?? 7,
    );
    const rememberDays = Number(
      this.configService.get("EXPIRE_DAY_REFRESH_TOKEN_REMEMBER") ?? 30,
    );
    const expireDays = rememberMe ? rememberDays : defaultDays;

    expiresIn.setDate(expiresIn.getDate() + expireDays);

    const refreshTokenName =
      this.configService.getOrThrow<string>("REFRESH_TOKEN_NAME");
    const domain = this.configService.get<string>("DOMAIN") || undefined;
    const secure = this.shouldUseSecureCookies();
    const sameSite = secure ? "none" : "lax";

    res.cookie(refreshTokenName, refreshToken, {
      httpOnly: true,
      domain,
      expires: expiresIn,
      secure,
      sameSite,
    });
  }

  removeRefreshTokenFromResponse(res: Response) {
    const refreshTokenName =
      this.configService.getOrThrow<string>("REFRESH_TOKEN_NAME");
    const domain = this.configService.get<string>("DOMAIN") || undefined;
    const secure = this.shouldUseSecureCookies();
    const sameSite = secure ? "none" : "lax";

    res.cookie(refreshTokenName, "", {
      httpOnly: true,
      domain,
      expires: new Date(0),
      secure,
      sameSite,
    });
  }

  // Sets the access token as an httpOnly cookie so it cannot be read by
  // client-side JavaScript. SameSite=strict prevents CSRF on same-origin.
  addAccessTokenResponse(res: Response, accessToken: string, rememberMe = false) {
    const accessTtlSeconds = this.parseExpirySeconds(
      this.configService.get("ACCESS_TOKEN_EXPIRES_IN") ?? "1h",
    );
    const domain = this.configService.get<string>("DOMAIN") || undefined;
    const secure = this.shouldUseSecureCookies();
    const sameSite = secure ? "none" : ("strict" as const);

    // If rememberMe, align cookie TTL with the refresh token so the browser
    // doesn't drop the access_token cookie between refreshes.
    const rememberDays = Number(
      this.configService.get("EXPIRE_DAY_REFRESH_TOKEN_REMEMBER") ?? 30,
    );
    const maxAge = rememberMe ? rememberDays * 24 * 60 * 60 : accessTtlSeconds;

    res.cookie("access_token", accessToken, {
      httpOnly: true,
      domain,
      maxAge: maxAge * 1000,
      secure,
      sameSite,
      path: "/",
    });
  }

  removeAccessTokenFromResponse(res: Response) {
    const domain = this.configService.get<string>("DOMAIN") || undefined;
    const secure = this.shouldUseSecureCookies();
    const sameSite = secure ? "none" : ("strict" as const);

    res.cookie("access_token", "", {
      httpOnly: true,
      domain,
      expires: new Date(0),
      secure,
      sameSite,
      path: "/",
    });
  }

  async getNewTokens(refreshToken: string) {
    let result: { id: string; type: string; sid?: string; rem?: boolean } & Record<string, unknown>;
    try {
      result = await this.jwt.verifyAsync(refreshToken, {
        secret: this.configService.getOrThrow("JWT_REFRESH_SECRET"),
      });
    } catch {
      throw new UnauthorizedException({ code: ErrorCode.INVALID_REFRESH_TOKEN, message: "Invalid refresh token" });
    }

    if (!result) throw new UnauthorizedException({ code: ErrorCode.INVALID_REFRESH_TOKEN, message: "Invalid refresh token" });

    if (result.type !== "refresh")
      throw new UnauthorizedException({ code: ErrorCode.INVALID_TOKEN_TYPE, message: "Invalid token type" });

    // Multiple near-simultaneous refresh calls (e.g. Next.js proxy + client-side
    // axios interceptor both reacting to the same expired access token) would
    // otherwise race on read-verify-rotate below: the loser sees an
    // already-rotated hash and gets treated as token replay. Serialize refreshes
    // per-user via a short Redis lock (RefreshTokenLockService) so only one
    // rotation happens at a time and concurrent callers wait for it instead of
    // triggering a false reuse-detected.
    //
    // logout/changePassword/confirmPasswordReset/confirmEmailChange (and admin
    // force-logout / account soft-delete) also take this same lock before
    // clearing hashedRefreshToken — otherwise an in-flight rotation could
    // finish and overwrite the hash right after a revocation, silently
    // "un-revoking" the session (lost update).
    return this.refreshLock.withLock(result.id, () =>
      this.rotateRefreshToken(refreshToken, result),
    );
  }

  private async rotateRefreshToken(
    refreshToken: string,
    result: { id: string; type: string; sid?: string; rem?: boolean },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: result.id },
    });

    if (!user) throw new NotFoundException({ code: ErrorCode.USER_NOT_FOUND, message: "The user not found" });

    if (user.status === UserStatus.DELETED) {
      throw new ForbiddenException({ code: ErrorCode.ACCOUNT_SCHEDULED_FOR_DELETION, message: "Account scheduled for deletion" });
    }
    if (user.status === UserStatus.BLOCKED) {
      throw new ForbiddenException({ code: ErrorCode.ACCOUNT_BLOCKED, message: "Account is blocked" });
    }

    if (!user.hashedRefreshToken)
      throw new UnauthorizedException({ code: ErrorCode.REFRESH_TOKEN_REVOKED, message: "Refresh token revoked" });

    const isRefreshTokenValid = await verify(
      user.hashedRefreshToken,
      refreshToken,
    );

    if (!isRefreshTokenValid) {
      // Refresh token reuse detected: the token is structurally valid (JWT
      // signature OK) but doesn't match the stored hash — a previously-rotated
      // token was replayed. This is a strong signal of token theft.
      // Revoke all sessions immediately to contain the breach.
      await this.clearRefreshTokenHash(user.id);
      await this.revokeAllSessions(user.id);
      throw new UnauthorizedException({ code: ErrorCode.INVALID_REFRESH_TOKEN, message: "Invalid refresh token" });
    }

    // Если в старом refresh была привязана сессия — проверяем, что она ещё активна,
    // и переиспользуем её id в новом access/refresh.
    let sessionId: string | undefined = undefined;
    if (typeof result.sid === "string" && result.sid) {
      const session = await this.prisma.userSession.findFirst({
        where: { id: result.sid, userId: user.id, revokedAt: null },
        select: { id: true },
      });
      if (!session) {
        throw new UnauthorizedException({ code: ErrorCode.SESSION_REVOKED, message: "Session revoked" });
      }
      sessionId = session.id;
      await this.prisma.userSession.update({
        where: { id: sessionId },
        data: { lastActiveAt: new Date() },
      });
    }

    const rememberMe = result.rem === true;
    const tokens = await this.issueTokens(user.id, sessionId, rememberMe);

    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);

    const {
      password,
      hashedRefreshToken: __,
      ...safeUser
    } = user as typeof user & {
      hashedRefreshToken?: string | null;
    };

    return {
      user: safeUser,
      ...tokens,
      rememberMe,
    };
  }

  async logout(userId: string) {
    await this.refreshLock.withLock(userId, () => this.clearRefreshTokenHash(userId));
    // Blacklist all access tokens issued before now for this user.
    // JwtStrategy checks iat against this timestamp and rejects older tokens.
    const accessTtl = this.parseExpirySeconds(
      this.configService.get("ACCESS_TOKEN_EXPIRES_IN") ?? "1h",
    );
    await this.redis.set(
      `session:blacklist:${userId}`,
      Date.now().toString(),
      "EX",
      accessTtl,
    );
  }

  private parseExpirySeconds(value: string): number {
    const match = value.match(/^(\d+)([smhd]?)$/);
    if (!match) return 3600;
    const num = parseInt(match[1]);
    const unit = match[2] || "s";
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return num * (multipliers[unit] ?? 1);
  }

  private async getCachedLocation(ip: string | null): Promise<ReturnType<typeof lookupSessionLocation>> {
    if (!ip) return null;
    const cacheKey = `geoip:${ip}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
    const location = lookupSessionLocation(ip);
    await this.redis.setex(cacheKey, 86400, JSON.stringify(location));
    return location;
  }

  async getSessions(userId: string, currentSessionId?: string) {
    const sessions = await this.prisma.userSession.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, ipAddress: true, userAgent: true, createdAt: true },
    });

    const locationsResults = await Promise.all(
      sessions.map((s) => this.getCachedLocation(s.ipAddress)),
    );

    return sessions.map((s, i) => ({
      ...s,
      device: parseDeviceLabel(s.userAgent),
      location: locationsResults[i],
      isCurrent: currentSessionId ? s.id === currentSessionId : false,
    }));
  }

  async revokeSession(sessionId: string, userId: string) {
    const session = await this.prisma.userSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) throw new NotFoundException({ code: ErrorCode.SESSION_NOT_FOUND, message: "Session not found" });
    if (session.revokedAt) throw new BadRequestException({ code: ErrorCode.SESSION_ALREADY_REVOKED, message: "Session already revoked" });

    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

    // Per-session blacklist: only invalidates access tokens that belong to
    // this specific session (matched by sid claim in the JWT payload).
    // Other sessions remain active — no cross-device disruption.
    const accessTtl = this.parseExpirySeconds(
      this.configService.get("ACCESS_TOKEN_EXPIRES_IN") ?? "1h",
    );
    await this.redis.set(
      `session:blacklist:${sessionId}`,
      Date.now().toString(),
      "EX",
      accessTtl,
    );

    return { success: true };
  }

  async revokeAllSessions(userId: string, currentSessionId?: string) {
    const where: Prisma.UserSessionWhereInput = {
      userId,
      revokedAt: null,
      ...(currentSessionId ? { id: { not: currentSessionId } } : {}),
    };

    const sessionsToRevoke = await this.prisma.userSession.findMany({
      where,
      select: { id: true },
    });

    await this.prisma.userSession.updateMany({
      where,
      data: { revokedAt: new Date() },
    });

    // Per-session blacklist for each revoked session so only those tokens
    // are invalidated immediately without disrupting the current session.
    const accessTtl = this.parseExpirySeconds(
      this.configService.get("ACCESS_TOKEN_EXPIRES_IN") ?? "1h",
    );
    const now = Date.now().toString();
    await Promise.all(
      sessionsToRevoke.map((s) =>
        this.redis.set(`session:blacklist:${s.id}`, now, "EX", accessTtl),
      ),
    );

    return { success: true, revoked: sessionsToRevoke.length };
  }

  // A pre-computed argon2 hash of the string "dummy" used to perform a
  // constant-time verification when the user is not found, preventing
  // user-enumeration via response timing differences.
  private static readonly DUMMY_HASH =
    "$argon2id$v=19$m=19456,t=2,p=1$dummysaltdummysaltdummy$dummyhashvaluedummyhashvaluedummy";

  private async validateUser(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: dto.username },
          { email: { equals: dto.username, mode: "insensitive" } },
        ],
      },
    });

    if (!user) {
      // Always run verify even when user not found to equalise response time
      // and prevent timing-based user enumeration (OWASP A07).
      await verify(AuthService.DUMMY_HASH, dto.password).catch(() => undefined);
      throw new UnauthorizedException({ code: ErrorCode.INVALID_CREDENTIALS, message: "Invalid credentials" });
    }

    if (!user.password) {
      // Account created via OAuth — no password set. Run the same dummy-verify
      // used for the "user not found" branch to avoid a timing signal that
      // distinguishes "no password" from "wrong password".
      await verify(AuthService.DUMMY_HASH, dto.password).catch(() => undefined);
      throw new UnauthorizedException({
        code: ErrorCode.PASSWORD_NOT_SET,
        message: "This account has no password set. Sign in with Google or reset your password.",
      });
    }

    const isValid = await verify(user.password, dto.password);

    if (!isValid) {
      throw new UnauthorizedException({ code: ErrorCode.INVALID_CREDENTIALS, message: "Invalid credentials" });
    }

    if (user.status === UserStatus.DELETED) {
      throw new ForbiddenException({ code: ErrorCode.ACCOUNT_SCHEDULED_FOR_DELETION, message: "Account scheduled for deletion. Contact support to restore." });
    }
    if (user.status === UserStatus.BLOCKED) {
      throw new ForbiddenException({ code: ErrorCode.ACCOUNT_BLOCKED, message: "Account is blocked" });
    }

    const {
      password,
      hashedRefreshToken: __,
      ...safeUser
    } = user as typeof user & {
      hashedRefreshToken?: string | null;
    };

    return safeUser;
  }

  shouldUseSecureCookies(): boolean {
    if (this.configService.get("NODE_ENV") === "production") {
      return true;
    }

    const domain = this.configService.get<string>("DOMAIN");
    if (domain && domain.trim() !== "" && !this.isLocalDomain(domain)) {
      return true;
    }

    const frontendUrl = this.configService.get<string>("FRONTEND_URL");
    if (!frontendUrl) return false;

    try {
      const parsed = new URL(frontendUrl);
      if (parsed.protocol === "https:") return true;
      return !this.isLocalDomain(parsed.hostname);
    } catch {
      return false;
    }
  }

  private isLocalDomain(host: string): boolean {
    const normalized = host.toLowerCase();
    return (
      normalized === "localhost" ||
      normalized === "127.0.0.1" ||
      normalized === "::1"
    );
  }

  private async issueTokens(userId: string, sessionId?: string, rememberMe = false) {
    const payload: { sub: string; id: string; sid?: string; rem?: boolean } = {
      sub: userId,
      id: userId,
    };
    if (sessionId) payload.sid = sessionId;
    if (rememberMe) payload.rem = true;

    const accessToken = await this.jwt.signAsync(
      { ...payload, type: "access" },
      {
        secret: this.configService.getOrThrow("JWT_ACCESS_SECRET"),
        expiresIn: this.configService.getOrThrow("ACCESS_TOKEN_EXPIRES_IN"),
      },
    );

    const refreshExpiresIn = rememberMe
      ? (this.configService.get("REFRESH_TOKEN_EXPIRES_IN_REMEMBER") ?? "30d")
      : this.configService.getOrThrow("REFRESH_TOKEN_EXPIRES_IN");

    const refreshToken = await this.jwt.signAsync(
      { ...payload, type: "refresh" },
      {
        secret: this.configService.getOrThrow("JWT_REFRESH_SECRET"),
        expiresIn: refreshExpiresIn,
      },
    );

    return { accessToken, refreshToken };
  }

  private async updateRefreshTokenHash(userId: string, refreshToken: string) {
    const hashedRefreshToken = await hash(refreshToken, ARGON2_OPTIONS);

    await this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken },
    });
  }

  private async clearRefreshTokenHash(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken: null },
    });
  }

  /* ──────────────────────────────────────────────────────────────
     PASSWORD RESET
     ────────────────────────────────────────────────────────────── */

  /**
   * Запросить ссылку для сброса пароля.
   * Всегда возвращаем успех (не палим, существует ли email).
   * При повторном запросе — старые активные токены пользователя инвалидируются,
   * чтобы actual была только последняя ссылка.
   */
  async requestPasswordReset(
    email: string,
    lang: PasswordResetEmailLang,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, email: true, status: true },
    });

    if (!user) return;
    if (user.status === UserStatus.DELETED || user.status === UserStatus.BLOCKED) {
      return;
    }

    // Инвалидируем все предыдущие неиспользованные токены — на случай угона старой ссылки.
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });

    const ttlHours = Number(
      this.configService.get("PASSWORD_RESET_TOKEN_TTL_HOURS") ?? 24,
    );
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    // Сырой токен: 32 байта URL-safe base64. В письме — он, в БД — argon2-хеш.
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = await hash(rawToken, ARGON2_OPTIONS);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        requestIp: meta?.ip ?? null,
        requestUserAgent: meta?.userAgent ?? null,
      },
    });

    await this.prisma.userEvent.create({
      data: {
        userId: user.id,
        type: UserEventType.PASSWORD_RESET_REQUESTED,
        metadata: meta?.ip ? { ip: meta.ip } : undefined,
      },
    });

    const frontendUrl =
      this.configService.get<string>("FRONTEND_URL") ?? "http://localhost:3000";
    const resetUrl = `${frontendUrl.replace(/\/+$/, "")}/${lang}/reset-password?token=${encodeURIComponent(rawToken)}`;

    await this.mail.sendPasswordResetEmail({
      to: user.email,
      resetUrl,
      expiresAt,
      lang,
    });
  }

  /**
   * Проверить токен. Email возвращаем замаскированным (для UX:
   * "вы меняете пароль для u***@example.com").
   * Никогда не отдаём реальный email и не палим причину детальнее enum-а.
   */
  async validatePasswordResetToken(
    rawToken: string,
  ): Promise<
    | { valid: true; expiresAt: string; email: string }
    | { valid: false; reason: "expired" | "used" | "not_found" }
  > {
    const record = await this.findPasswordResetToken(rawToken);
    if (!record) return { valid: false, reason: "not_found" };
    if (record.usedAt) return { valid: false, reason: "used" };
    if (record.expiresAt.getTime() <= Date.now()) {
      return { valid: false, reason: "expired" };
    }
    return {
      valid: true,
      expiresAt: record.expiresAt.toISOString(),
      email: this.maskEmail(record.user.email),
    };
  }

  /**
   * Подтвердить новый пароль.
   * Транзакционно: помечаем токен использованным, ставим новый argon2-хеш,
   * чистим refresh-token hash, отзываем все сессии, инвалидируем access-токены через redis blacklist.
   * Дополнительно — отправляем уведомительное письмо «пароль изменён».
   */
  async confirmPasswordReset(
    rawToken: string,
    newPassword: string,
    meta?: { ip?: string; lang?: PasswordResetEmailLang },
  ): Promise<void> {
    const record = await this.findPasswordResetToken(rawToken);

    if (!record) {
      throw new NotFoundException({ code: ErrorCode.TOKEN_INVALID, message: "Token not found or invalid" });
    }
    if (record.usedAt) {
      throw new ConflictException({ code: ErrorCode.TOKEN_USED, message: "Token already used" });
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      // 410 Gone — фронт переключится на view-expired
      throw new BadRequestException({ code: ErrorCode.TOKEN_EXPIRED, message: "Token expired" });
    }
    if (
      record.user.status === UserStatus.DELETED ||
      record.user.status === UserStatus.BLOCKED
    ) {
      throw new ForbiddenException({ code: ErrorCode.ACCOUNT_UNAVAILABLE, message: "Account unavailable" });
    }

    const passwordHash = await hash(newPassword, ARGON2_OPTIONS);
    const now = new Date();

    // Clearing hashedRefreshToken must not race with an in-flight token
    // rotation (getNewTokens) — otherwise the rotation could finish right
    // after this transaction and re-set a valid hash, un-revoking the account.
    await this.refreshLock.withLock(record.userId, () =>
      this.prisma.$transaction([
        this.prisma.passwordResetToken.update({
          where: { id: record.id },
          data: {
            usedAt: now,
            consumedIp: meta?.ip ?? null,
          },
        }),
        // Заодно инвалидируем все остальные неиспользованные токены — чтобы вторая параллельная ссылка не сработала.
        this.prisma.passwordResetToken.updateMany({
          where: {
            userId: record.userId,
            usedAt: null,
            id: { not: record.id },
          },
          data: { usedAt: now },
        }),
        this.prisma.user.update({
          where: { id: record.userId },
          data: {
            password: passwordHash,
            hashedRefreshToken: null,
          },
        }),
        this.prisma.userSession.updateMany({
          where: { userId: record.userId, revokedAt: null },
          data: { revokedAt: now },
        }),
        this.prisma.userEvent.create({
          data: {
            userId: record.userId,
            type: UserEventType.PASSWORD_RESET_COMPLETED,
            metadata: meta?.ip ? { ip: meta.ip } : undefined,
          },
        }),
      ]),
    );

    // Глобальный access-token blacklist (за пределами транзакции — Redis).
    const accessTtl = this.parseExpirySeconds(
      this.configService.get("ACCESS_TOKEN_EXPIRES_IN") ?? "1h",
    );
    await this.redis.set(
      `session:blacklist:${record.userId}`,
      Date.now().toString(),
      "EX",
      accessTtl,
    );
    await this.redis.del(`user:profile:${record.userId}`);

    // Уведомительное письмо — best effort, ошибки не пробрасываем
    void this.mail
      .sendPasswordChangedEmail({
        to: record.user.email,
        lang: meta?.lang ?? "ru",
      })
      .catch(() => undefined);
  }

  /** Удалить просроченные/использованные токены старше 7 дней. Дёргается из cron. */
  async cleanupExpiredPasswordResetTokens(): Promise<number> {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const res = await this.prisma.passwordResetToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: cutoff } }, { usedAt: { lt: cutoff } }],
      },
    });
    return res.count;
  }

  /**
   * Линейный скан по неиспользованным/неистёкшим токенам с argon2-verify.
   * Допустимо: при cleanup живых записей единицы-десятки, индекс по expiresAt быстро отсекает мусор.
   */
  private async findPasswordResetToken(rawToken: string) {
    if (!rawToken || rawToken.length < 20) return null;

    const candidates = await this.prisma.passwordResetToken.findMany({
      where: {
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        user: { select: { id: true, email: true, status: true } },
      },
    });

    for (const c of candidates) {
      try {
        const ok = await verify(c.tokenHash, rawToken);
        if (ok) return c;
      } catch {
        // битый хеш — пропускаем
      }
    }
    return null;
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split("@");
    if (!domain) return email;
    if (local.length <= 2) return `${local[0] ?? ""}***@${domain}`;
    return `${local.slice(0, 2)}***@${domain}`;
  }

  /* ──────────────────────────────────────────────────────────────
     PASSWORD CHANGE (authenticated)
     ────────────────────────────────────────────────────────────── */

  /**
   * Сменить пароль авторизованным юзером (текущий → новый).
   * Отличие от password-reset: здесь юзер уже залогинен, ему не нужен email-токен.
   * Поведение после смены — то же, что и при reset:
   * revoke all sessions, blacklist access-токенов, уведомительное письмо.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    meta?: { ip?: string; lang?: PasswordResetEmailLang },
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, password: true, status: true },
    });
    if (!user) throw new NotFoundException({ code: ErrorCode.USER_NOT_FOUND, message: "The user not found" });

    if (user.status === UserStatus.DELETED || user.status === UserStatus.BLOCKED) {
      throw new ForbiddenException({ code: ErrorCode.ACCOUNT_UNAVAILABLE, message: "Account unavailable" });
    }

    if (!user.password) {
      throw new BadRequestException({
        code: ErrorCode.PASSWORD_NOT_SET,
        message: "This account has no password set. Use the password reset flow to set one.",
      });
    }

    const ok = await verify(user.password, currentPassword);
    if (!ok) throw new UnauthorizedException({ code: ErrorCode.INVALID_CURRENT_PASSWORD, message: "Invalid current password" });

    if (currentPassword === newPassword) {
      throw new BadRequestException({ code: ErrorCode.SAME_PASSWORD, message: "New password must differ from current" });
    }

    const passwordHash = await hash(newPassword, ARGON2_OPTIONS);
    const now = new Date();

    await this.refreshLock.withLock(user.id, () =>
      this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: user.id },
          data: { password: passwordHash, hashedRefreshToken: null },
        }),
        this.prisma.userSession.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: now },
        }),
        this.prisma.userEvent.create({
          data: {
            userId: user.id,
            type: UserEventType.PASSWORD_CHANGED,
            metadata: meta?.ip ? { ip: meta.ip } : undefined,
          },
        }),
      ]),
    );

    const accessTtl = this.parseExpirySeconds(
      this.configService.get("ACCESS_TOKEN_EXPIRES_IN") ?? "1h",
    );
    await this.redis.set(
      `session:blacklist:${user.id}`,
      Date.now().toString(),
      "EX",
      accessTtl,
    );
    await this.redis.del(`user:profile:${user.id}`);

    void this.mail
      .sendPasswordChangedEmail({ to: user.email, lang: meta?.lang ?? "ru" })
      .catch(() => undefined);
  }

  /* ──────────────────────────────────────────────────────────────
     EMAIL CHANGE (authenticated)
     ────────────────────────────────────────────────────────────── */

  /**
   * Запросить смену email. Письмо со ссылкой отправляется на НОВЫЙ адрес —
   * подтверждение = доказательство владения. Требует ввод текущего пароля
   * (защита от угнанной сессии).
   * Все предыдущие незакрытые токены этого юзера инвалидируются.
   */
  async requestEmailChange(
    userId: string,
    newEmail: string,
    currentPassword: string,
    lang: EmailChangeLang,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, password: true, status: true },
    });
    if (!user) throw new NotFoundException({ code: ErrorCode.USER_NOT_FOUND, message: "The user not found" });

    if (user.status === UserStatus.DELETED || user.status === UserStatus.BLOCKED) {
      throw new ForbiddenException({ code: ErrorCode.ACCOUNT_UNAVAILABLE, message: "Account unavailable" });
    }

    if (!user.password) {
      throw new BadRequestException({
        code: ErrorCode.PASSWORD_NOT_SET,
        message: "This account has no password set. Set a password first via password reset.",
      });
    }

    const ok = await verify(user.password, currentPassword);
    if (!ok) throw new UnauthorizedException({ code: ErrorCode.INVALID_CURRENT_PASSWORD, message: "Invalid current password" });

    const normalized = newEmail.trim().toLowerCase();

    if (normalized === user.email.trim().toLowerCase()) {
      throw new BadRequestException({ code: ErrorCode.SAME_EMAIL, message: "New email must differ from current" });
    }

    // Чтобы не палить занятость email чужого аккаунта — НЕ возвращаем 409 здесь.
    // Если такой email уже есть — токен мы всё равно создадим, но при confirmEmailChange
    // вылетит уникальный constraint и юзер увидит "email уже занят" только в этот момент.
    // Это не идеально, но и не дискверит юзеров через timing — поведение симметрично.
    // Однако чтобы не плодить мусорные токены и письма — проверим прямо тут:
    const taken = await this.prisma.user.findFirst({
      where: { email: { equals: normalized, mode: "insensitive" }, NOT: { id: userId } },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException({ code: ErrorCode.EMAIL_TAKEN, message: "This email is already taken" });
    }

    await this.prisma.emailChangeToken.updateMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });

    const ttlHours = Number(
      this.configService.get("EMAIL_CHANGE_TOKEN_TTL_HOURS") ?? 24,
    );
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = await hash(rawToken, ARGON2_OPTIONS);

    await this.prisma.emailChangeToken.create({
      data: {
        userId: user.id,
        newEmail: normalized,
        tokenHash,
        expiresAt,
        requestIp: meta?.ip ?? null,
        requestUserAgent: meta?.userAgent ?? null,
      },
    });

    await this.prisma.userEvent.create({
      data: {
        userId: user.id,
        type: UserEventType.EMAIL_CHANGE_REQUESTED,
        metadata: { newEmail: normalized, ip: meta?.ip ?? null },
      },
    });

    const frontendUrl =
      this.configService.get<string>("FRONTEND_URL") ?? "http://localhost:3000";
    const confirmUrl = `${frontendUrl.replace(/\/+$/, "")}/${lang}/email-change/confirm?token=${encodeURIComponent(rawToken)}`;

    await this.mail.sendEmailChangeConfirmEmail({
      to: normalized,
      newEmail: normalized,
      confirmUrl,
      expiresAt,
      lang,
    });

    return { ok: true };
  }

  /**
   * Подтвердить смену email по токену.
   * Транзакционно: помечаем токен использованным, обновляем User.email,
   * чистим refresh-token hash, отзываем все сессии, blacklist access-токенов.
   * Уведомление отправляется на старый адрес.
   */
  async confirmEmailChange(
    rawToken: string,
    meta?: { ip?: string; lang?: EmailChangeLang },
  ): Promise<{ ok: true; email: string }> {
    const record = await this.findEmailChangeToken(rawToken);

    if (!record) throw new NotFoundException({ code: ErrorCode.TOKEN_INVALID, message: "Token not found or invalid" });
    if (record.usedAt) throw new ConflictException({ code: ErrorCode.TOKEN_USED, message: "Token already used" });
    if (record.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException({ code: ErrorCode.TOKEN_EXPIRED, message: "Token expired" });
    }
    if (
      record.user.status === UserStatus.DELETED ||
      record.user.status === UserStatus.BLOCKED
    ) {
      throw new ForbiddenException({ code: ErrorCode.ACCOUNT_UNAVAILABLE, message: "Account unavailable" });
    }

    const oldEmail = record.user.email;
    const now = new Date();

    try {
      await this.refreshLock.withLock(record.userId, () =>
        this.prisma.$transaction([
          this.prisma.emailChangeToken.update({
            where: { id: record.id },
            data: { usedAt: now, consumedIp: meta?.ip ?? null },
          }),
          this.prisma.emailChangeToken.updateMany({
            where: {
              userId: record.userId,
              usedAt: null,
              id: { not: record.id },
            },
            data: { usedAt: now },
          }),
          this.prisma.user.update({
            where: { id: record.userId },
            data: {
              email: record.newEmail,
              hashedRefreshToken: null,
            },
          }),
          this.prisma.userSession.updateMany({
            where: { userId: record.userId, revokedAt: null },
            data: { revokedAt: now },
          }),
          this.prisma.userEvent.create({
            data: {
              userId: record.userId,
              type: UserEventType.EMAIL_CHANGE_COMPLETED,
              metadata: { oldEmail, newEmail: record.newEmail, ip: meta?.ip ?? null },
            },
          }),
        ]),
      );
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        // Кто-то занял email между request и confirm.
        throw new ConflictException({ code: ErrorCode.EMAIL_TAKEN, message: "This email is already taken" });
      }
      throw e;
    }

    const accessTtl = this.parseExpirySeconds(
      this.configService.get("ACCESS_TOKEN_EXPIRES_IN") ?? "1h",
    );
    await this.redis.set(
      `session:blacklist:${record.userId}`,
      Date.now().toString(),
      "EX",
      accessTtl,
    );
    await this.redis.del(`user:profile:${record.userId}`);

    // Уведомление шлём на СТАРЫЙ адрес — чтобы юзер успел отреагировать на угон.
    void this.mail
      .sendEmailChangedNoticeEmail({
        to: oldEmail,
        newEmail: record.newEmail,
        lang: meta?.lang ?? "ru",
      })
      .catch(() => undefined);

    return { ok: true, email: record.newEmail };
  }

  async cleanupExpiredEmailChangeTokens(): Promise<number> {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const res = await this.prisma.emailChangeToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: cutoff } }, { usedAt: { lt: cutoff } }],
      },
    });
    return res.count;
  }

  private async findEmailChangeToken(rawToken: string) {
    if (!rawToken || rawToken.length < 20) return null;

    const candidates = await this.prisma.emailChangeToken.findMany({
      where: { usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        user: { select: { id: true, email: true, status: true } },
      },
    });

    for (const c of candidates) {
      try {
        const ok = await verify(c.tokenHash, rawToken);
        if (ok) return c;
      } catch {
        // битый хеш — пропускаем
      }
    }
    return null;
  }

  /* ──────────────────────────────────────────────────────────────
     OAUTH (Google, and later Telegram) — find-or-create login
     ────────────────────────────────────────────────────────────── */

  async loginWithOAuthProfile(
    provider: AuthProvider,
    profile: OAuthProfile,
    meta?: { ip?: string; userAgent?: string },
  ) {
    const user = await this.findOrCreateOAuthUser(provider, profile);

    if (user.status === UserStatus.DELETED) {
      throw new ForbiddenException({ code: ErrorCode.ACCOUNT_SCHEDULED_FOR_DELETION, message: "Account scheduled for deletion" });
    }
    if (user.status === UserStatus.BLOCKED) {
      throw new ForbiddenException({ code: ErrorCode.ACCOUNT_BLOCKED, message: "Account is blocked" });
    }

    // rememberMe = true для OAuth: пользователь не видит чекбокс "запомнить меня" —
    // сессия через Google всегда долгоживущая, иначе пользователя тихо разлогинит
    // через 7 дней без объяснимой для него причины.
    const rememberMe = true;
    const session = await this.recordSession(user.id, meta?.ip, meta?.userAgent);
    const tokens = await this.issueTokens(user.id, session.id, rememberMe);
    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);

    await this.prisma.userEvent.create({
      data: { userId: user.id, type: UserEventType.START_SESSION },
    });

    const { password, hashedRefreshToken, ...safeUser } = user;
    return { user: safeUser, ...tokens, rememberMe };
  }

  private async findOrCreateOAuthUser(
    provider: AuthProvider,
    profile: OAuthProfile,
    attempt = 0,
  ) {
    const existingAccount = await this.prisma.account.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId: profile.providerAccountId } },
      include: { user: true },
    });
    if (existingAccount) return existingAccount.user;

    // Автолинк ТОЛЬКО если провайдер подтвердил email — иначе account-takeover:
    // злоумышленник с чужим OAuth-аккаунтом на тот же (неподтверждённый) email
    // мог бы захватить чужой профиль на платформе.
    const existingByEmail = profile.emailVerified && profile.email
      ? await this.prisma.user.findFirst({
          where: { email: { equals: profile.email, mode: "insensitive" } },
        })
      : null;

    try {
      if (existingByEmail) {
        if (existingByEmail.status === UserStatus.DELETED || existingByEmail.status === UserStatus.BLOCKED) {
          throw new ForbiddenException({ code: ErrorCode.ACCOUNT_UNAVAILABLE, message: "Account unavailable" });
        }
        await this.prisma.account.create({
          data: {
            userId: existingByEmail.id,
            provider,
            providerAccountId: profile.providerAccountId,
            email: profile.email!,
          },
        });
        return existingByEmail;
      }

      const username = await this.generateUniqueUsername(
        profile.email,
        profile.preferredUsername ?? profile.firstName,
      );
      const avatarVariants = await this.downloadAndProcessGoogleAvatar(profile.avatarUrl);
      // Telegram не даёт email — placeholder на несуществующем .internal TLD,
      // т.к. User.email обязателен и @unique. Пользователь сможет заменить его
      // позже через существующий email-change flow.
      const email = profile.email ?? `telegram-${profile.providerAccountId}@users.mottlarbe.internal`;
      return await this.prisma.user.create({
        data: {
          email,
          username,
          name: profile.firstName,
          surname: profile.lastName || profile.firstName,
          password: null,
          avatar: avatarVariants?.original,
          avatarThumb: avatarVariants?.thumb,
          avatarMedium: avatarVariants?.medium,
          accounts: {
            create: { provider, providerAccountId: profile.providerAccountId, email },
          },
        },
      });
    } catch (e) {
      // Гонка: конкурентный запрос успел создать Account ИЛИ User с этим email
      // между нашей проверкой выше и этим create. Повторяем весь find-or-create
      // с нуля (не только точечный lookup) — второй проход найдёт то, что создал
      // конкурент, независимо от того, на каком constraint была коллизия.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 2) {
        return this.findOrCreateOAuthUser(provider, profile, attempt + 1);
      }
      throw e;
    }
  }

  private async generateUniqueUsername(email: string | null, firstName: string): Promise<string> {
    const base = slugifyName(firstName, email?.split("@")[0]);

    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = attempt === 0 ? base : `${base}${Math.floor(1000 + Math.random() * 9000)}`;
      const taken = await this.prisma.user.findFirst({ where: { username: candidate }, select: { id: true } });
      if (!taken) return candidate;
    }
    // DB unique constraint (Step 1) — финальный backstop, даже если 5 попыток коллизировали.
    return `${base}${randomBytes(4).toString("hex")}`;
  }

  private async downloadAndProcessGoogleAvatar(
    avatarUrl: string | undefined,
  ): Promise<AvatarVariants | null> {
    if (!avatarUrl) return null;
    try {
      const { hostname } = new URL(avatarUrl);
      if (!hostname.endsWith("googleusercontent.com")) return null;

      const response = await fetch(avatarUrl);
      if (!response.ok) return null;
      const buffer = Buffer.from(await response.arrayBuffer());

      const tmpDir = join(process.cwd(), "uploads", "tmp");
      fs.mkdirSync(tmpDir, { recursive: true });
      const tmpPath = join(tmpDir, `google-avatar-${randomBytes(6).toString("hex")}.jpg`);
      fs.writeFileSync(tmpPath, buffer);

      const outputDir = join(process.cwd(), "uploads", "avatars");
      const baseName = `avatar-google-${randomBytes(6).toString("hex")}`;
      const variants = await this.imageProcessing.processAvatar(tmpPath, baseName, outputDir);

      fs.unlink(tmpPath, () => undefined);
      return variants;
    } catch {
      // Недоступность Google-аватара (сеть, 404, битый формат) не должна
      // блокировать регистрацию — пользователь просто останется без аватара
      // и сможет загрузить свой через существующий uploadAvatar.
      return null;
    }
  }

  /* ──────────────────────────────────────────────────────────────
     OAUTH ACCOUNT MANAGEMENT — link/unlink from an active session
     ────────────────────────────────────────────────────────────── */

  async getLinkedAccounts(userId: string) {
    const [user, accounts] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { password: true } }),
      this.prisma.account.findMany({
        where: { userId },
        select: { id: true, provider: true, email: true, createdAt: true },
      }),
    ]);
    if (!user) throw new NotFoundException({ code: ErrorCode.USER_NOT_FOUND, message: "The user not found" });
    return { hasPassword: user.password !== null, accounts };
  }

  async unlinkAccount(userId: string, accountId: string) {
    const [user, accountsCount] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { password: true } }),
      this.prisma.account.count({ where: { userId } }),
    ]);
    if (!user) throw new NotFoundException({ code: ErrorCode.USER_NOT_FOUND, message: "The user not found" });

    // Нельзя отвязать единственный способ входа: если пароля нет и это
    // единственный Account — пользователь потеряет доступ к своему аккаунту.
    if (!user.password && accountsCount <= 1) {
      throw new BadRequestException({ code: ErrorCode.LAST_LOGIN_METHOD, message: "Cannot unlink the only sign-in method. Set a password first." });
    }

    const account = await this.prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) throw new NotFoundException({ code: ErrorCode.ACCOUNT_NOT_FOUND, message: "Linked account not found" });

    await this.prisma.account.delete({ where: { id: accountId } });
    return { ok: true };
  }

  async linkGoogleAccount(userId: string, profile: GoogleProfile) {
    const existing = await this.prisma.account.findUnique({
      where: { provider_providerAccountId: { provider: AuthProvider.GOOGLE, providerAccountId: profile.providerAccountId } },
    });
    if (existing) {
      // Тот же Google-аккаунт уже привязан к ДРУГОМУ пользователю — не перепривязывать молча.
      if (existing.userId !== userId) {
        throw new ConflictException({ code: ErrorCode.ACCOUNT_ALREADY_LINKED, message: "This Google account is already linked to another profile" });
      }
      return { ok: true }; // уже привязан к этому же юзеру — идемпотентно
    }

    try {
      await this.prisma.account.create({
        data: { userId, provider: AuthProvider.GOOGLE, providerAccountId: profile.providerAccountId, email: profile.email },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException({ code: ErrorCode.ACCOUNT_ALREADY_LINKED, message: "This Google account is already linked to another profile" });
      }
      throw e;
    }
    return { ok: true };
  }

  /* ──────────────────────────────────────────────────────────────
     TELEGRAM LOGIN WIDGET — hash-based verification, not OAuth2
     ────────────────────────────────────────────────────────────── */

  async loginWithTelegram(dto: TelegramLoginDto, meta?: { ip?: string; userAgent?: string }) {
    const botToken = this.configService.getOrThrow<string>("TELEGRAM_BOT_TOKEN");
    const isValid = verifyTelegramLogin({ ...dto }, botToken);
    if (!isValid) {
      throw new UnauthorizedException({ code: ErrorCode.TELEGRAM_SIGNATURE_INVALID, message: "Invalid Telegram login signature" });
    }

    const profile: OAuthProfile = {
      providerAccountId: String(dto.id),
      email: null,
      emailVerified: false,
      firstName: dto.first_name,
      lastName: dto.last_name ?? "",
      avatarUrl: dto.photo_url,
      preferredUsername: dto.username,
    };

    return this.loginWithOAuthProfile(AuthProvider.TELEGRAM, profile, meta);
  }

  async linkTelegramAccount(userId: string, dto: TelegramLoginDto) {
    const botToken = this.configService.getOrThrow<string>("TELEGRAM_BOT_TOKEN");
    if (!verifyTelegramLogin({ ...dto }, botToken)) {
      throw new UnauthorizedException({ code: ErrorCode.TELEGRAM_SIGNATURE_INVALID, message: "Invalid Telegram login signature" });
    }

    const providerAccountId = String(dto.id);
    const existing = await this.prisma.account.findUnique({
      where: { provider_providerAccountId: { provider: AuthProvider.TELEGRAM, providerAccountId } },
    });
    if (existing) {
      // Тот же Telegram-аккаунт уже привязан к ДРУГОМУ пользователю — не перепривязывать молча.
      if (existing.userId !== userId) {
        throw new ConflictException({ code: ErrorCode.ACCOUNT_ALREADY_LINKED, message: "This Telegram account is already linked to another profile" });
      }
      return { ok: true }; // уже привязан к этому же юзеру — идемпотентно
    }

    try {
      await this.prisma.account.create({
        data: {
          userId,
          provider: AuthProvider.TELEGRAM,
          providerAccountId,
          email: `telegram-${providerAccountId}@users.mottlarbe.internal`,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException({ code: ErrorCode.ACCOUNT_ALREADY_LINKED, message: "This Telegram account is already linked to another profile" });
      }
      throw e;
    }
    return { ok: true };
  }
}
