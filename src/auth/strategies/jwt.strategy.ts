import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Request } from "express";
import { ErrorCode } from "src/common/errors/error-codes";
import { RedisService } from "src/redis/redis.service";
import { UserService } from "../../user/user.service";

const ACCESS_TOKEN_COOKIE = "access_token";

// Extract JWT from Authorization: Bearer header first, then fall back to
// httpOnly cookie. This allows the proxy (Next.js) to forward the token via
// cookie while keeping it inaccessible to client-side JavaScript.
const extractJwt = (req: Request): string | null => {
  const fromBearer = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  if (fromBearer) return fromBearer;
  return (req.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined) ?? null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private userService: UserService,
    private redis: RedisService,
  ) {
    super({
      jwtFromRequest: extractJwt,
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>("JWT_ACCESS_SECRET"),
      passReqToCallback: false,
    });
  }

  async validate({ id, iat, sid }: { id: string; iat: number; sid?: string }) {
    // 1. Per-session blacklist — set when a specific session is revoked.
    if (sid) {
      const sessionBlacklistTs = await this.redis.get(`session:blacklist:${sid}`);
      if (sessionBlacklistTs && iat * 1000 < Number(sessionBlacklistTs)) {
        throw new UnauthorizedException({ code: ErrorCode.TOKEN_REVOKED, message: "Token revoked" });
      }
    }

    // 2. Global user blacklist — set on logout (all sessions) or full revoke.
    const userBlacklistTs = await this.redis.get(`session:blacklist:${id}`);
    if (userBlacklistTs && iat * 1000 < Number(userBlacklistTs)) {
      throw new UnauthorizedException({ code: ErrorCode.TOKEN_REVOKED, message: "Token revoked" });
    }

    const user = await this.userService.getUserById(id);
    return { ...user, sessionId: sid };
  }
}
