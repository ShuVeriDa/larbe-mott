export const DEFAULT_GEMINI_MODEL =
  process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";

export const SUPPORTED_GEMINI_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.1-pro",
] as const;

export type GeminiModel = (typeof SUPPORTED_GEMINI_MODELS)[number];

export const geminiUrl = (
  apiKey: string,
  model: string = DEFAULT_GEMINI_MODEL,
) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
