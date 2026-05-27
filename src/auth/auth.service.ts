import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Prisma, UserEventType, UserStatus } from "@prisma/client";
import { hash, verify } from "argon2";
import { randomBytes } from "crypto";
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

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private jwt: JwtService,
    private userService: UserService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
  ) {}

  async login(dto: LoginDto, meta?: { ip?: string; userAgent?: string }) {
    const user = await this.validateUser(dto);
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

  async getNewTokens(refreshToken: string) {
    const result = await this.jwt.verifyAsync(refreshToken, {
      secret: this.configService.getOrThrow("JWT_REFRESH_SECRET"),
    });

    if (!result) throw new UnauthorizedException({ code: ErrorCode.INVALID_REFRESH_TOKEN, message: "Invalid refresh token" });

    if (result.type !== "refresh")
      throw new UnauthorizedException({ code: ErrorCode.INVALID_TOKEN_TYPE, message: "Invalid token type" });

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

    if (!isRefreshTokenValid)
      throw new UnauthorizedException({ code: ErrorCode.INVALID_REFRESH_TOKEN, message: "Invalid refresh token" });

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
    await this.clearRefreshTokenHash(userId);
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

  async getSessions(userId: string, currentSessionId?: string) {
    const sessions = await this.prisma.userSession.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, ipAddress: true, userAgent: true, createdAt: true },
    });

    return sessions.map((s) => ({
      ...s,
      device: parseDeviceLabel(s.userAgent),
      location: lookupSessionLocation(s.ipAddress),
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

    // Инвалидируем все активные access-токены пользователя.
    // Per-session инвалидация невозможна без sessionId в JWT payload —
    // отзыв одной сессии блокирует токены всех устройств до следующего рефреша.
    const accessTtl = this.parseExpirySeconds(
      this.configService.get("ACCESS_TOKEN_EXPIRES_IN") ?? "1h",
    );
    await this.redis.set(
      `session:blacklist:${userId}`,
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

    const result = await this.prisma.userSession.updateMany({
      where,
      data: { revokedAt: new Date() },
    });

    // ВАЖНО: глобальный redis-blacklist выкинет ВСЕ access-токены пользователя — в том числе
    // токен текущей сессии. Чтобы фронт не разлогинился сразу после "Завершить все",
    // ставим blacklist только если currentSessionId не передан (т.е. реально хотим отозвать всё).
    // При передаче currentSessionId фронт получит новые access-токены через refresh — и старые
    // токены других сессий не пройдут проверку UserSession.revokedAt в getNewTokens.
    if (!currentSessionId) {
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

    return { success: true, revoked: result.count };
  }

  private async validateUser(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: dto.username },
          { email: { equals: dto.username, mode: "insensitive" } },
        ],
      },
    });

    if (!user) throw new NotFoundException({ code: ErrorCode.USER_NOT_FOUND, message: "The user not found" });

    const isValid = await verify(user.password, dto.password);

    if (!isValid) throw new UnauthorizedException({ code: ErrorCode.INVALID_PASSWORD, message: "Invalid password" });

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

  private shouldUseSecureCookies(): boolean {
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
    const hashedRefreshToken = await hash(refreshToken);

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
    const tokenHash = await hash(rawToken);

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

    const passwordHash = await hash(newPassword);
    const now = new Date();

    await this.prisma.$transaction([
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
    ]);

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

    const ok = await verify(user.password, currentPassword);
    if (!ok) throw new UnauthorizedException({ code: ErrorCode.INVALID_CURRENT_PASSWORD, message: "Invalid current password" });

    if (currentPassword === newPassword) {
      throw new BadRequestException({ code: ErrorCode.SAME_PASSWORD, message: "New password must differ from current" });
    }

    const passwordHash = await hash(newPassword);
    const now = new Date();

    await this.prisma.$transaction([
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
    ]);

    const accessTtl = this.parseExpirySeconds(
      this.configService.get("ACCESS_TOKEN_EXPIRES_IN") ?? "1h",
    );
    await this.redis.set(
      `session:blacklist:${user.id}`,
      Date.now().toString(),
      "EX",
      accessTtl,
    );

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
    const tokenHash = await hash(rawToken);

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
      await this.prisma.$transaction([
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
      ]);
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
}
