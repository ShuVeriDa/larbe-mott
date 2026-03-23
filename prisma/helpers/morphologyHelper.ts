import { PrismaPg } from "@prisma/adapter-pg";
import { Language, MorphRuleType, PrismaClient } from "@prisma/client";
import "dotenv/config";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const RULES: { suffix: string; type: MorphRuleType; language: Language; priority: number }[] = [
  // ─── Падежи (NOUN_CASE) ───────────────────────────────────────────────────
  { suffix: "ан",   type: MorphRuleType.NOUN_CASE, language: Language.CHE, priority: 10 }, // родительный
  { suffix: "на",   type: MorphRuleType.NOUN_CASE, language: Language.CHE, priority: 10 }, // дательный
  { suffix: "ца",   type: MorphRuleType.NOUN_CASE, language: Language.CHE, priority: 8  }, // творительный
  { suffix: "х",    type: MorphRuleType.NOUN_CASE, language: Language.CHE, priority: 7  }, // местный I
  { suffix: "е",    type: MorphRuleType.NOUN_CASE, language: Language.CHE, priority: 6  }, // местный II
  { suffix: "га",   type: MorphRuleType.NOUN_CASE, language: Language.CHE, priority: 9  }, // направительный
  { suffix: "гара", type: MorphRuleType.NOUN_CASE, language: Language.CHE, priority: 9  }, // исходный
  { suffix: "ехь",  type: MorphRuleType.NOUN_CASE, language: Language.CHE, priority: 8  }, // местный III
  // ─── Множественное число (PLURAL) ────────────────────────────────────────
  { suffix: "ш",    type: MorphRuleType.PLURAL,    language: Language.CHE, priority: 10 }, // основной суффикс мн.ч.
  { suffix: "й",    type: MorphRuleType.PLURAL,    language: Language.CHE, priority: 8  }, // альтернативный
  { suffix: "ий",   type: MorphRuleType.PLURAL,    language: Language.CHE, priority: 7  }, // заимствования
  // ─── Прошедшее время (VERB_PAST) ─────────────────────────────────────────
  { suffix: "ира",  type: MorphRuleType.VERB_PAST, language: Language.CHE, priority: 10 }, // простое прошедшее
  { suffix: "ина",  type: MorphRuleType.VERB_PAST, language: Language.CHE, priority: 9  }, // прошедшее II
  { suffix: "на",   type: MorphRuleType.VERB_PAST, language: Language.CHE, priority: 8  }, // краткое прошедшее
  { suffix: "ра",   type: MorphRuleType.VERB_PAST, language: Language.CHE, priority: 7  }, // прошедшее III
];

export const seedMorphologyRules = async () => {
  for (const rule of RULES) {
    await prisma.morphologyRule.upsert({
      where: { suffix_type_language: { suffix: rule.suffix, type: rule.type, language: rule.language } },
      create: { ...rule, isActive: true },
      update: { priority: rule.priority, isActive: true },
    });
  }

  console.log(`✅  Morphology rules seed: создано правил — ${RULES.length}`);
};
