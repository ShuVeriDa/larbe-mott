import { Injectable } from "@nestjs/common";

const KEY_VERSION_NORMALIZED = (versionId: string, normalized: string) =>
  `${versionId}:${normalized}`;

export type TokenInfoCacheValue = {
  tokenId: string;
  word: string;
  normalized: string;
  lemmaId: string | null;
  lemma: string | null;
  forms: string[];
  source: string | null;
  /** Для ЭТАП 15: ответ «перевод слова» */
  translation: string | null;
  grammar: string | null;
  baseForm: string | null;
};

@Injectable()
export class TokenInfoCacheService {
  private byTokenId = new Map<string, TokenInfoCacheValue>();
  private byVersionNormalized = new Map<string, TokenInfoCacheValue>();

  get(tokenId: string): TokenInfoCacheValue | undefined {
    return this.byTokenId.get(tokenId);
  }

  /** Кэш по (versionId, normalized): повторное слово в том же тексте отдаётся без запроса в БД. */
  getByVersionNormalized(
    versionId: string,
    normalized: string,
  ): TokenInfoCacheValue | undefined {
    return this.byVersionNormalized.get(
      KEY_VERSION_NORMALIZED(versionId, normalized),
    );
  }

  set(
    tokenId: string,
    versionId: string,
    normalized: string,
    value: TokenInfoCacheValue,
  ) {
    this.byTokenId.set(tokenId, value);
    this.byVersionNormalized.set(
      KEY_VERSION_NORMALIZED(versionId, normalized),
      value,
    );
  }
}
