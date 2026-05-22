const PUNCT_REGEX = /[«»"().,!?;:—ʰᴴʼ]/g;

export function normalizeToken(word: string): string {
  if (!word) return "";

  let normalized = word;

  // lowercase
  normalized = normalized.toLowerCase();

  // remove punctuation
  normalized = normalized.replace(PUNCT_REGEX, "");

  // collapse spaces
  normalized = normalized.replace(/\s+/g, " ");

  normalized = normalized.trim();

  return normalized;
}
