/**
 * Запись из нашего dosham-бэкенда (`GET /api/dictionary/lookup/:word`).
 * Полная схема `UnifiedEntry` гораздо шире — здесь только нужные нам поля.
 */
export interface DoshamMeaning {
  translation: string;
  examples?: { nah: string; ru: string }[];
}

export interface DoshamEntry {
  id: number;
  word: string;
  wordNormalized: string;
  partOfSpeech?: string | null;
  meanings: DoshamMeaning[];
}

export type LookupResult = {
  normalized: string;
  translation: string | null;
  tranAlt: string | null;
} | null;
