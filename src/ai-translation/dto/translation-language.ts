export const SUPPORTED_TRANSLATION_LANGUAGES = [
  "ru",
  "en",
  "ar",
  "de",
  "fr",
  "tr",
] as const;

export type TranslationLanguage = (typeof SUPPORTED_TRANSLATION_LANGUAGES)[number];

export const SUPPORTED_SOURCE_LANGUAGES = ["che", "ar", "en"] as const;

export type SourceLanguage = (typeof SUPPORTED_SOURCE_LANGUAGES)[number];

export const SOURCE_LANGUAGE_NAMES: Record<SourceLanguage, string> = {
  che: "Chechen",
  ar: "Arabic",
  en: "English",
};
