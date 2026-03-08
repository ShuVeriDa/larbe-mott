export function normalizeToken(word: string): string {
  return word
    .toLowerCase()
    .replace(/[«»"().,!?;:]/g, "")
    .trim();
}
