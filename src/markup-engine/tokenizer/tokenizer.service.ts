import { Injectable } from "@nestjs/common";
import { RawToken, RawTokenWithOffsets } from "./tokenizer.types";

const TOKEN_REGEX = /([\p{L}\p{M}]+(?:-[\p{L}\p{M}]+)*)|([.,!?;:()"«»—])/gu;

@Injectable()
export class TokenizerService {
  tokenize(text: string): RawToken[] {
    const tokens: RawToken[] = [];
    let match;
    let position = 0;
    TOKEN_REGEX.lastIndex = 0;
    while ((match = TOKEN_REGEX.exec(text)) !== null) {
      const word = match[1] || match[2];
      tokens.push({ value: word, position: position++ });
    }
    return tokens;
  }

  /**
   * Tokenize and return character offsets (startOffset, endOffset) in the source string.
   * Used to replace a word in page content when editing a token.
   */
  tokenizeWithOffsets(text: string): RawTokenWithOffsets[] {
    const tokens: RawTokenWithOffsets[] = [];
    let match;
    let position = 0;
    TOKEN_REGEX.lastIndex = 0;
    while ((match = TOKEN_REGEX.exec(text)) !== null) {
      const word = match[1] || match[2];
      const startOffset = match.index;
      const endOffset = startOffset + word.length;
      tokens.push({
        value: word,
        position: position++,
        startOffset,
        endOffset,
      });
    }
    return tokens;
  }
}
