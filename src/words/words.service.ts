import { Injectable } from "@nestjs/common";
import { UnknownWordProcessor } from "src/markup-engine/unknown-word/unknown-word.processor";
import { TokenService } from "src/token/token.service";
import { WordLookupByWordService } from "./word-lookup-by-word.service";

@Injectable()
export class WordsService {
  constructor(
    private readonly tokenService: TokenService,
    private readonly wordLookupByWordService: WordLookupByWordService,
    private readonly unknownWordProcessor: UnknownWordProcessor,
  ) {}

  async lookup(tokenId: string, userId: string | undefined) {
    const info = await this.tokenService.getTokenInfo(tokenId, userId);
    const hasData =
      info.translation != null ||
      info.grammar != null ||
      info.baseForm != null;
    if (hasData) {
      return {
        translation: info.translation ?? null,
        grammar: info.grammar ?? null,
        baseForm: info.baseForm ?? null,
      };
    }
    const byWord = await this.wordLookupByWordService.lookup(info.normalized, userId);
    const result = {
      translation: byWord.translation ?? null,
      grammar: byWord.grammar ?? null,
      baseForm: byWord.baseForm ?? null,
    };
    const notFound =
      result.translation == null &&
      result.grammar == null &&
      result.baseForm == null;
    if (notFound) {
      void this.unknownWordProcessor
        .recordFromLookup(info.normalized, info.tokenId, info.textId)
        .catch(() => {});
    }
    return result;
  }
}
