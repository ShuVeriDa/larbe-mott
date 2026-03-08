export type TokenType = "word" | "punct";

export interface RawToken {
  value: string;
  position: number;
}
