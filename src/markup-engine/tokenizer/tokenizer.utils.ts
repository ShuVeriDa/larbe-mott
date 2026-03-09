const PUNCT_REGEX = /[«»"().,!?;:—]/g;

export function normalizeToken(word: string): string {
  if (!word) return "";

  let normalized = word;

  // lowercase
  normalized = normalized.toLowerCase();

  // remove punctuation
  normalized = normalized.replace(PUNCT_REGEX, "");

  // normalize diacritics
  normalized = normalized.normalize("NFD");
  normalized = normalized.replace(/[\u0300-\u036f]/g, "");

  // collapse spaces
  normalized = normalized.replace(/\s+/g, " ");

  normalized = normalized.trim();

  return normalized;
}
