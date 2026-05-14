/**
 * Strips HTML tags and normalises whitespace from a raw dictionary string.
 * Handles <b>, <i>, <nobr>, accent marks (combining chars), etc.
 */
export function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")       // remove all HTML tags
    .replace(/\r?\n/g, " ")          // collapse newlines
    .replace(/\s{2,}/g, " ")         // collapse multiple spaces
    .replace(/^\s*[–—-]\s*/, "")     // strip leading dash (Исмаилов format: " – гореть")
    .trim();
}

export function splitTranslation(cleaned: string): { main: string; alt: string | null } {
  return { main: cleaned, alt: null };
}

/**
 * Full pipeline: strip HTML → split into main/alt.
 * Returns null if the cleaned string is empty.
 */
export function parseTranslation(
  raw: string | null | undefined,
): { main: string; alt: string | null } | null {
  if (!raw) return null;
  const cleaned = stripHtml(raw);
  if (!cleaned) return null;
  return splitTranslation(cleaned);
}
