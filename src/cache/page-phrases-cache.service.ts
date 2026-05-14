import { Injectable } from "@nestjs/common";
import { RedisService } from "src/redis/redis.service";

const KEY = (textId: string, pageNumber: number) =>
  `page-phrases:${textId}:${pageNumber}`;

const TTL_SECONDS = 300; // 5 min

@Injectable()
export class PagePhrasesCacheService {
  constructor(private readonly redis: RedisService) {}

  async get<T>(textId: string, pageNumber: number): Promise<T | undefined> {
    const val = await this.redis.get(KEY(textId, pageNumber));
    return val ? (JSON.parse(val) as T) : undefined;
  }

  async set<T>(textId: string, pageNumber: number, value: T): Promise<void> {
    await this.redis.set(KEY(textId, pageNumber), JSON.stringify(value), "EX", TTL_SECONDS);
  }

  async invalidate(textId: string, pageNumber: number): Promise<void> {
    await this.redis.del(KEY(textId, pageNumber));
  }
}
