import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { parse as parseCookie } from 'cookie';
import type { IncomingMessage } from 'http';
import { RedisService } from 'src/redis/redis.service';

export interface WsAuthPayload {
  userId: string;
  sessionId?: string;
}

@Injectable()
export class JwtWsHelper {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async verifyHandshake(req: IncomingMessage): Promise<WsAuthPayload | null> {
    const cookieHeader = req.headers.cookie ?? '';
    const cookies = parseCookie(cookieHeader);
    const token = cookies['access_token'];

    if (!token) return null;

    let payload: { id: string; iat: number; sid?: string };
    try {
      payload = this.jwtService.verify(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      return null;
    }

    const { id, iat, sid } = payload;

    // Per-session blacklist
    if (sid) {
      const sessionBlacklistTs = await this.redis.get(`session:blacklist:${sid}`);
      if (sessionBlacklistTs && iat * 1000 < Number(sessionBlacklistTs)) {
        return null;
      }
    }

    // Global user blacklist
    const userBlacklistTs = await this.redis.get(`session:blacklist:${id}`);
    if (userBlacklistTs && iat * 1000 < Number(userBlacklistTs)) {
      return null;
    }

    return { userId: id, sessionId: sid };
  }
}
