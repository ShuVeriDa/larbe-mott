import { RawToken } from "src/markup-engine/tokenizer/tokenizer.types";

export const tokenize = (text: string): RawToken[] => {
  const tokens: RawToken[] = [];

  const regex = /([\p{L}\p{M}]+(?:-[\p{L}\p{M}]+)*)|([.,!?;:()"«»—])/gu;

  let match;
  let position = 0;

  while ((match = regex.exec(text)) !== null) {
    const word = match[1] || match[2];

    tokens.push({
      value: word,
      position: position++,
    });
  }

  return tokens;
};
