export const SUPPORTED_TRANSLATION_LANGUAGES = [
  "ru",
  "en",
  "ar",
  "de",
  "fr",
  "tr",
] as const;

export type TranslationLanguage = (typeof SUPPORTED_TRANSLATION_LANGUAGES)[number];
