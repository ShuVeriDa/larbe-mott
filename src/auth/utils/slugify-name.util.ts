// Best-effort "any name -> ASCII username slug" transliteration. Deliberately
// simple (no linguistic rules) — this feeds a username, not display text, so
// round-trip fidelity doesn't matter, only that it produces stable, non-empty
// a-z0-9 output for names in scripts commonly seen in this platform's audience
// (Cyrillic first and foremost — Russian/Chechen users signing in via Google).
const CYRILLIC_TO_ASCII: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  // Chechen-specific Cyrillic letter used in names (Iа, Iа-...).
  Ӏ: "",
};

const transliterate = (input: string): string =>
  input
    .toLowerCase()
    .split("")
    .map(ch => CYRILLIC_TO_ASCII[ch] ?? ch)
    .join("");

/**
 * Produces a lowercase a-z0-9 slug suitable as a username base. Falls back
 * to "user" only when every candidate is empty after normalization (e.g.
 * a name in a script with no mapping here and no usable email local-part) —
 * generateUniqueUsername's numeric-suffix retry + DB unique constraint (Step 1)
 * still guarantee no collisions even in that fallback case.
 */
export const slugifyName = (...candidates: (string | null | undefined)[]): string => {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const slug = transliterate(candidate)
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 12);
    if (slug) return slug;
  }
  return "user";
};
