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

/**
 * Splits a cleaned translation string into main translation and optional alt.
 *
 * Strategy:
 *  1. Split on the first "; " — everything before = main, after = alt
 *  2. If no ";", split on first "," only when the result before comma is short (<= 40 chars)
 *     (avoids splitting long single-meaning translations mid-sentence)
 *  3. Trim both parts; if alt is empty after trimming, return null
 *
 * Examples:
 *  "гореть; опасаться, бояться"  → { main: "гореть", alt: "опасаться, бояться" }
 *  "гореть; топорище"            → { main: "гореть", alt: "топорище" }
 *  "делать, действовать, строить"→ { main: "делать", alt: "действовать, строить" }
 *  "очень длинное значение без разделителей" → { main: "...", alt: null }
 */
export function splitTranslation(cleaned: string): { main: string; alt: string | null } {
  const semiIdx = cleaned.indexOf("; ");
  if (semiIdx !== -1) {
    const main = cleaned.slice(0, semiIdx).trim();
    const alt = cleaned.slice(semiIdx + 2).trim() || null;
    return { main, alt };
  }

  const commaIdx = cleaned.indexOf(", ");
  if (commaIdx !== -1 && commaIdx <= 40) {
    const main = cleaned.slice(0, commaIdx).trim();
    const alt = cleaned.slice(commaIdx + 2).trim() || null;
    return { main, alt };
  }

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
