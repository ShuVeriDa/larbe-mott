import { Injectable } from "@nestjs/common";
import { TokenService } from "src/token/token.service";

@Injectable()
export class WordsService {
  constructor(private readonly tokenService: TokenService) {}

  async lookup(tokenId: string, userId: string) {
    const info = await this.tokenService.getTokenInfo(tokenId, userId);
    return {
      translation: info.translation ?? null,
      grammar: info.grammar ?? null,
      baseForm: info.baseForm ?? null,
    };
  }
}
