import { Injectable } from "@nestjs/common";

@Injectable()
export class MorphologyRuleEngine {
  private cache = new Map<string, string>();

  private nounCases = [
    "ан",
    "ен",
    "ин",
    "ун",
    "на",
    "ана",
    "а",
    "о",
    "с",
    "ца",
    "х",
    "е",
    "га",
    "ла",
    "лла",
  ];

  private pluralSuffix = ["ш", "ий", "аш", "арш", "рчий", "рш"];

  private verbPast = ["ира", "ра", "ла", "та", "на", "ина"];

  stripSuffix(word: string): string {
    if (this.cache.has(word)) {
      return this.cache.get(word)!;
    }

    for (const suffix of this.nounCases) {
      if (word.endsWith(suffix)) {
        const stem = word.slice(0, -suffix.length);

        const result = this.stripSuffix(stem);

        this.cache.set(word, result);

        return result;
      }
    }

    this.cache.set(word, word);

    return word;
  }

  detectPlural(word: string): string | null {
    for (const suffix of this.pluralSuffix) {
      if (word.endsWith(suffix)) {
        return word.slice(0, -suffix.length);
      }
    }

    return null;
  }

  detectVerb(word: string): string | null {
    for (const suffix of this.verbPast) {
      if (word.endsWith(suffix)) {
        return word.slice(0, -suffix.length);
      }
    }

    return null;
  }
}
