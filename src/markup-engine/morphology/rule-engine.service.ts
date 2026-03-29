import { Injectable, OnModuleInit } from "@nestjs/common";
import { Language, MorphRuleType } from "@prisma/client";
import { PrismaService } from "src/prisma.service";

type RuleSet = {
  nounCases: string[];
  pluralSuffix: string[];
  verbPast: string[];
};

@Injectable()
export class MorphologyRuleEngine implements OnModuleInit {
  private cache = new Map<string, string>();

  private rulesByLanguage = new Map<Language, RuleSet>();

  private readonly defaultRules: Record<Language, RuleSet> = {
    [Language.CHE]: {
      nounCases: ["ан", "ен", "ин", "ун", "на", "ана", "а", "о", "с", "ца", "х", "е", "га", "ла", "лла"],
      pluralSuffix: ["ш", "ий", "аш", "арш", "рчий", "рш"],
      verbPast: ["ира", "ра", "ла", "та", "на", "ина"],
    },
    [Language.RU]: { nounCases: [], pluralSuffix: [], verbPast: [] },
    [Language.AR]: { nounCases: [], pluralSuffix: [], verbPast: [] },
    [Language.EN]:  { nounCases: [], pluralSuffix: [], verbPast: [] },
  };

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.reloadRules();
  }

  async reloadRules() {
    this.cache.clear();
    this.rulesByLanguage.clear();

    const rules = await this.prisma.morphologyRule.findMany({
      where: { isActive: true },
      orderBy: { priority: "desc" },
    });

    for (const lang of Object.values(Language)) {
      const langRules = rules.filter((r) => r.language === lang);
      const fromDb: RuleSet = {
        nounCases: langRules
          .filter((r) =>
            r.type === MorphRuleType.NOUN_CASE ||
            r.type === MorphRuleType.SUFFIX ||
            r.type === MorphRuleType.ENDING,
          )
          .map((r) => r.suffix),
        pluralSuffix: langRules.filter((r) => r.type === MorphRuleType.PLURAL).map((r) => r.suffix),
        verbPast: langRules.filter((r) => r.type === MorphRuleType.VERB_PAST).map((r) => r.suffix),
      };

      const defaults = this.defaultRules[lang];
      this.rulesByLanguage.set(lang, {
        nounCases: fromDb.nounCases.length ? fromDb.nounCases : defaults.nounCases,
        pluralSuffix: fromDb.pluralSuffix.length ? fromDb.pluralSuffix : defaults.pluralSuffix,
        verbPast: fromDb.verbPast.length ? fromDb.verbPast : defaults.verbPast,
      });
    }
  }

  private getRules(language: Language): RuleSet {
    return this.rulesByLanguage.get(language) ?? this.defaultRules[Language.CHE];
  }

  stripSuffix(word: string, language: Language): string {
    const cacheKey = `${language}:${word}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const { nounCases } = this.getRules(language);
    for (const suffix of nounCases) {
      if (word.endsWith(suffix)) {
        const stem = word.slice(0, -suffix.length);
        const result = this.stripSuffix(stem, language);
        this.cache.set(cacheKey, result);
        return result;
      }
    }

    this.cache.set(cacheKey, word);
    return word;
  }

  detectPlural(word: string, language: Language): string | null {
    const { pluralSuffix } = this.getRules(language);
    for (const suffix of pluralSuffix) {
      if (word.endsWith(suffix)) {
        return word.slice(0, -suffix.length);
      }
    }
    return null;
  }

  detectVerb(word: string, language: Language): string | null {
    const { verbPast } = this.getRules(language);
    for (const suffix of verbPast) {
      if (word.endsWith(suffix)) {
        return word.slice(0, -suffix.length);
      }
    }
    return null;
  }
}
