import { Injectable } from "@nestjs/common";

@Injectable()
export class TokenInfoCacheService {
  private cache = new Map<string, any>();

  get(tokenId: string) {
    return this.cache.get(tokenId);
  }

  set(tokenId: string, value: any) {
    this.cache.set(tokenId, value);
  }
}
