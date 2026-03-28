import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { hash, verify } from "argon2";
import { Response } from "express";
import { PrismaService } from "src/prisma.service";
import { UserEventType } from "@prisma/client";
import { CreateUserDto } from "src/user/dto/create-user.dto";
import { LoginDto } from "src/user/dto/login.dto";
import { UserService } from "src/user/user.service";
import { RedisService } from "src/redis/redis.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private jwt: JwtService,
    private userService: UserService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto);

    const tokens = await this.issueTokens(user.id);

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

  async register(dto: CreateUserDto) {
    const existingUserByUsername = await this.userService.getByUserName(dto.username);
    const existingUserByEmail = await this.userService.getByEmail(dto.email);

    if (existingUserByUsername)
      throw new ConflictException("User with this username already exists");
    if (existingUserByEmail)
      throw new ConflictException("User with this email already exists");

    const createdUser = await this.userService.create(dto);
    const {
      password: _,
      hashedRefreshToken: __,
      ...user
    } = createdUser as typeof createdUser & {
      hashedRefreshToken?: string | null;
    };

    const tokens = await this.issueTokens(user.id);

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
    await this.prisma.userSession.create({
      data: {
        userId,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      },
    });
  }

  addRefreshTokenResponse(res: Response, refreshToken: string) {
    const expiresIn = new Date();
    const expireDays = Number(
      this.configService.get("EXPIRE_DAY_REFRESH_TOKEN") ?? 7,
    );

    expiresIn.setDate(expiresIn.getDate() + expireDays);

    const refreshTokenName =
      this.configService.getOrThrow<string>("REFRESH_TOKEN_NAME");
    const domain = this.configService.get<string>("DOMAIN") || undefined;
    const isProduction = this.configService.get("NODE_ENV") === "production";

    res.cookie(refreshTokenName, refreshToken, {
      httpOnly: true,
      domain,
      expires: expiresIn,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
    });
  }

  removeRefreshTokenFromResponse(res: Response) {
    const refreshTokenName =
      this.configService.getOrThrow<string>("REFRESH_TOKEN_NAME");
    const domain = this.configService.get<string>("DOMAIN") || undefined;
    const isProduction = this.configService.get("NODE_ENV") === "production";

    res.cookie(refreshTokenName, "", {
      httpOnly: true,
      domain,
      expires: new Date(0),
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
    });
  }

  async getNewTokens(refreshToken: string) {
    const result = await this.jwt.verifyAsync(refreshToken, {
      secret: this.configService.getOrThrow("JWT_REFRESH_SECRET"),
    });

    if (!result) throw new UnauthorizedException("Invalid refresh token");

    if (result.type !== "refresh")
      throw new UnauthorizedException("Invalid token type");

    const user = await this.prisma.user.findUnique({
      where: { id: result.id },
    });

    if (!user) throw new NotFoundException("The user not found");

    if (!user.hashedRefreshToken)
      throw new UnauthorizedException("Refresh token revoked");

    const isRefreshTokenValid = await verify(
      user.hashedRefreshToken,
      refreshToken,
    );

    if (!isRefreshTokenValid)
      throw new UnauthorizedException("Invalid refresh token");

    const tokens = await this.issueTokens(user.id);

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

  async getSessions(userId: string) {
    return this.prisma.userSession.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, ipAddress: true, userAgent: true, createdAt: true },
    });
  }

  async revokeSession(sessionId: string, userId: string) {
    const session = await this.prisma.userSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) throw new NotFoundException("Session not found");
    if (session.revokedAt) throw new BadRequestException("Session already revoked");

    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

    return { success: true };
  }

  async revokeAllSessions(userId: string) {
    await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { success: true };
  }

  private async validateUser(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { username: dto.username },
    });

    if (!user) throw new NotFoundException("The user not found");

    const isValid = await verify(user.password, dto.password);

    if (!isValid) throw new UnauthorizedException("Invalid password");

    const {
      password,
      hashedRefreshToken: __,
      ...safeUser
    } = user as typeof user & {
      hashedRefreshToken?: string | null;
    };

    return safeUser;
  }

  private async issueTokens(userId: string) {
    const payload = {
      sub: userId,
      id: userId,
    };

    const accessToken = await this.jwt.signAsync(
      { ...payload, type: "access" },
      {
        secret: this.configService.getOrThrow("JWT_ACCESS_SECRET"),
        expiresIn: this.configService.getOrThrow("ACCESS_TOKEN_EXPIRES_IN"),
      },
    );

    const refreshToken = await this.jwt.signAsync(
      { ...payload, type: "refresh" },
      {
        secret: this.configService.getOrThrow("JWT_REFRESH_SECRET"),
        expiresIn: this.configService.getOrThrow("REFRESH_TOKEN_EXPIRES_IN"),
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
}
