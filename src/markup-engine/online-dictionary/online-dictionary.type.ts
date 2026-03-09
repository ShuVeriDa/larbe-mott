export interface DikWord {
  id: string;
  word1?: string;
  word: string;
  translate: string;
}

export interface DikDictionary {
  dictTableName: string;
  dictName: string;
  words: DikWord[];
}

export interface DikResponse {
  data: DikDictionary[];
  suggestedWords: DikWord[];
  errors: string[];
}

export type LookupResult = {
  normalized: string;
  translation: string | null;
} | null;
