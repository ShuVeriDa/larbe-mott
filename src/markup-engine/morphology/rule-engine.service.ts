import { Injectable, OnModuleInit } from "@nestjs/common";
import { MorphRuleType } from "@prisma/client";
import { PrismaService } from "src/prisma.service";

@Injectable()
export class MorphologyRuleEngine implements OnModuleInit {
  private cache = new Map<string, string>();

  private nounCases: string[] = [];
  private pluralSuffix: string[] = [];
  private verbPast: string[] = [];

  private readonly defaultNounCases = [
    "ан", "ен", "ин", "ун", "на", "ана", "а", "о", "с", "ца", "х", "е", "га", "ла", "лла",
  ];
  private readonly defaultPluralSuffix = ["ш", "ий", "аш", "арш", "рчий", "рш"];
  private readonly defaultVerbPast = ["ира", "ра", "ла", "та", "на", "ина"];

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.reloadRules();
  }

  async reloadRules() {
    this.cache.clear();

    const rules = await this.prisma.morphologyRule.findMany({
      where: { isActive: true },
      orderBy: { priority: "desc" },
    });

    const fromDb = {
      [MorphRuleType.NOUN_CASE]: rules.filter((r) => r.type === MorphRuleType.NOUN_CASE).map((r) => r.suffix),
      [MorphRuleType.PLURAL]: rules.filter((r) => r.type === MorphRuleType.PLURAL).map((r) => r.suffix),
      [MorphRuleType.VERB_PAST]: rules.filter((r) => r.type === MorphRuleType.VERB_PAST).map((r) => r.suffix),
    };

    this.nounCases = fromDb[MorphRuleType.NOUN_CASE].length
      ? fromDb[MorphRuleType.NOUN_CASE]
      : this.defaultNounCases;

    this.pluralSuffix = fromDb[MorphRuleType.PLURAL].length
      ? fromDb[MorphRuleType.PLURAL]
      : this.defaultPluralSuffix;

    this.verbPast = fromDb[MorphRuleType.VERB_PAST].length
      ? fromDb[MorphRuleType.VERB_PAST]
      : this.defaultVerbPast;
  }

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
