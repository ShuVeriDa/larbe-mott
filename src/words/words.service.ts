import { Injectable } from "@nestjs/common";
import { TokenService } from "src/token/token.service";
import { WordLookupByWordService } from "./word-lookup-by-word.service";

@Injectable()
export class WordsService {
  constructor(
    private readonly tokenService: TokenService,
    private readonly wordLookupByWordService: WordLookupByWordService,
  ) {}

  async lookup(tokenId: string, userId: string) {
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
    const byWord = await this.wordLookupByWordService.lookup(info.normalized);
    return {
      translation: byWord.translation ?? null,
      grammar: byWord.grammar ?? null,
      baseForm: byWord.baseForm ?? null,
    };
  }
}
