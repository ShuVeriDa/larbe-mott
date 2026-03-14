export type TokenType = "word" | "punct";

export interface RawToken {
  value: string;
  position: number;
}

/** Token with character offsets in the source text (for editing text by token). */
export interface RawTokenWithOffsets extends RawToken {
  startOffset: number;
  endOffset: number;
}
