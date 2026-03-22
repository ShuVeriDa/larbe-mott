import { Injectable } from "@nestjs/common";
import { RedisService } from "src/redis/redis.service";

const TOKEN_KEY = (tokenId: string) => `token-info:id:${tokenId}`;
const VN_KEY = (versionId: string, normalized: string) =>
  `token-info:vn:${versionId}:${normalized}`;
const TTL_SECONDS = 86400; // 24h

export type TokenInfoCacheValue = {
  tokenId: string;
  word: string;
  normalized: string;
  textId?: string;
  lemmaId: string | null;
  lemma: string | null;
  forms: string[];
  source: string | null;
  translation: string | null;
  grammar: string | null;
  baseForm: string | null;
};

@Injectable()
export class TokenInfoCacheService {
  constructor(private readonly redis: RedisService) {}

  async get(tokenId: string): Promise<TokenInfoCacheValue | undefined> {
    const val = await this.redis.get(TOKEN_KEY(tokenId));
    return val ? (JSON.parse(val) as TokenInfoCacheValue) : undefined;
  }

  /** Кэш по (versionId, normalized): повторное слово в том же тексте отдаётся без запроса в БД. */
  async getByVersionNormalized(
    versionId: string,
    normalized: string,
  ): Promise<TokenInfoCacheValue | undefined> {
    const val = await this.redis.get(VN_KEY(versionId, normalized));
    return val ? (JSON.parse(val) as TokenInfoCacheValue) : undefined;
  }

  async set(
    tokenId: string,
    versionId: string,
    normalized: string,
    value: TokenInfoCacheValue,
  ): Promise<void> {
    const serialized = JSON.stringify(value);
    await Promise.all([
      this.redis.set(TOKEN_KEY(tokenId), serialized, "EX", TTL_SECONDS),
      this.redis.set(VN_KEY(versionId, normalized), serialized, "EX", TTL_SECONDS),
    ]);
  }

  /** Remove cache entry by token ID (e.g. after admin edits the token). */
  async deleteByTokenId(tokenId: string): Promise<void> {
    await this.redis.del(TOKEN_KEY(tokenId));
  }

  /** Remove cache entry by (versionId, normalized) so next lookup refetches. */
  async deleteByVersionNormalized(
    versionId: string,
    normalized: string,
  ): Promise<void> {
    await this.redis.del(VN_KEY(versionId, normalized));
  }
}
