export function normalizeToken(word: string): string {
  if (!word) return "";

  return word
    .toLowerCase()
    .replace(/[«»"().,!?;:—]/g, "")
    .trim();
}
