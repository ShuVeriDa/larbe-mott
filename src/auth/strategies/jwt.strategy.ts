import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { RedisService } from "src/redis/redis.service";
import { UserService } from "../../user/user.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private userService: UserService,
    private redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>("JWT_ACCESS_SECRET"),
    });
  }

  async validate({ id, iat }: { id: string; iat: number }) {
    const blacklistTs = await this.redis.get(`session:blacklist:${id}`);
    if (blacklistTs && iat * 1000 < Number(blacklistTs)) {
      throw new UnauthorizedException("Token revoked");
    }
    return this.userService.getUserById(id);
  }
}
