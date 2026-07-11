/**
 * Запись из dosham-бэкенда (`GET /dictionary/lookup/:word`).
 * Полная схема `UnifiedEntry` — только нужные нам поля.
 */
export interface DoshamMeaning {
  translation: string;
  note?: string | null;
  label?: string | null;
  partOfSpeech?: string | null;
  examples?: { nah: string; ru: string }[];
}

export interface DoshamGrammar {
  genitive?: string | null;
  dative?: string | null;
  ergative?: string | null;
  instrumental?: string | null;
  plural?: string | null;
  pluralClass?: string | null;
  obliqueStem?: string | null;
  verbPresent?: string | null;
  verbPast?: string | null;
  verbParticiple?: string | null;
}

export interface DoshamEntry {
  id: number;
  word: string;
  wordModern: string | null;
  wordAccented: string | null;
  wordModernAccented: string | null;
  wordNormalized: string;
  partOfSpeech: string | null;
  partOfSpeechNah: string | null;
  nounClass: string | null;
  nounClassPlural: string | null;
  entryType: string | null;
  variants: string[];
  grammar: DoshamGrammar | null;
  meanings: DoshamMeaning[];
  setPhrases: { nah: string; ru: string }[] | null;
  domain: string | null;
  wordLevel: string | null;
  attested: boolean;
  sources: string[];
}

export interface LookupMeaning {
  translation: string;
  note: string | null;
  examples: { text: string; translation: string | null }[];
}

export interface LookupGrammar {
  genitive?: string | null;
  dative?: string | null;
  ergative?: string | null;
  instrumental?: string | null;
  plural?: string | null;
  pluralClass?: string | null;
  obliqueStem?: string | null;
  verbPresent?: string | null;
  verbPast?: string | null;
  verbParticiple?: string | null;
}

export type LookupResult = {
  doshamId: number | null;
  normalized: string;
  translation: string | null;
  baseForm: string | null;
  wordModern: string | null;
  wordModernAccented: string | null;
  grammar: string | null;
  grammarForms: LookupGrammar | null;
  nounClass: string | null;
  nounClassPlural: string | null;
  tags: string[];
  wordLevel: string | null;
  variants: string[];
  sources: string[];
  attested: boolean;
  setPhrases: { nah: string; ru: string }[] | null;
  meanings: LookupMeaning[];
} | null;
