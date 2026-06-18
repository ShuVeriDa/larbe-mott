import { PrismaPg } from "@prisma/adapter-pg";
import { PlanType, PrismaClient } from "@prisma/client";
import "dotenv/config";
import type { PlanLimits } from "../../src/billing/plan-limits";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// All features are free — limits match PRO tier.
// To restore original free-tier restrictions, replace the values below with:
//   translationsPerDay: 50, wordsInDictionary: 500, availableTexts: 20,
//   maxFolders: 0, dictionaryFolders: false, hasComplexTexts: false,
//   spaceRepetition: false, hasFlashcards: false, wordContexts: false,
//   analytics: false, hasAdvancedAnalytics: false, hasPrioritySupport: false
const FREE_LIMITS: PlanLimits = {
  translationsPerDay: -1,
  wordsInDictionary: -1,
  availableTexts: -1,
  statisticsDays: -1,
  maxFolders: -1,
  readTexts: true,
  wordTranslation: true,
  tokenAnalysis: true,
  personalDictionary: true,
  dictionaryFolders: true,
  hasComplexTexts: true,
  textProgress: true,
  spaceRepetition: true,
  hasFlashcards: true,
  wordContexts: true,
  analytics: true,
  hasAdvancedAnalytics: true,
  hasPrioritySupport: true,
};

const PREMIUM_LIMITS: PlanLimits = {
  translationsPerDay: -1,
  wordsInDictionary: 10000,
  availableTexts: -1,
  statisticsDays: -1,
  maxFolders: 20,
  readTexts: true,
  wordTranslation: true,
  tokenAnalysis: true,
  personalDictionary: true,
  dictionaryFolders: true,
  hasComplexTexts: true,
  textProgress: true,
  spaceRepetition: true,
  hasFlashcards: true,
  wordContexts: true,
  analytics: true,
  hasAdvancedAnalytics: false,
  hasPrioritySupport: false,
};

const PRO_LIMITS: PlanLimits = {
  translationsPerDay: -1,
  wordsInDictionary: -1,
  availableTexts: -1,
  statisticsDays: -1,
  maxFolders: -1,
  readTexts: true,
  wordTranslation: true,
  tokenAnalysis: true,
  personalDictionary: true,
  dictionaryFolders: true,
  hasComplexTexts: true,
  textProgress: true,
  spaceRepetition: true,
  hasFlashcards: true,
  wordContexts: true,
  analytics: true,
  hasAdvancedAnalytics: true,
  hasPrioritySupport: true,
};

export async function seedPlans() {
  const plans = [
    {
      code: "FREE",
      name: "Бесплатный",
      type: PlanType.FREE,
      description: "50 переводов в день · 500 слов в словаре · базовые функции",
      priceCents: 0,
      currency: "RUB",
      interval: null,
      groupCode: null,
      trialDays: 0,
      isActive: true,
      limits: FREE_LIMITS,
    },
    {
      code: "PREMIUM_MONTHLY",
      name: "Premium",
      type: PlanType.PREMIUM,
      description: "Безлимит переводов · 10 000 слов · статистика и повторение",
      priceCents: 69000,
      currency: "RUB",
      interval: "month",
      groupCode: "PREMIUM",
      trialDays: 7,
      isActive: true,
      limits: PREMIUM_LIMITS,
    },
    {
      code: "PREMIUM_YEARLY",
      name: "Premium",
      type: PlanType.PREMIUM,
      description: "Безлимит переводов · 10 000 слов · статистика и повторение",
      priceCents: 662400, // 552 ₽ × 12, скидка 20% от monthly
      currency: "RUB",
      interval: "year",
      groupCode: "PREMIUM",
      trialDays: 7,
      isActive: true,
      limits: PREMIUM_LIMITS,
    },
    {
      code: "PRO_MONTHLY",
      name: "Pro",
      type: PlanType.PRO,
      description: "Всё из Premium · безлимит слов · расш. аналитика · приор. поддержка",
      priceCents: 129000,
      currency: "RUB",
      interval: "month",
      groupCode: "PRO",
      trialDays: 7,
      isActive: true,
      limits: PRO_LIMITS,
    },
    {
      code: "PRO_YEARLY",
      name: "Pro",
      type: PlanType.PRO,
      description: "Всё из Premium · безлимит слов · расш. аналитика · приор. поддержка",
      priceCents: 1238400, // 1032 ₽ × 12, скидка 20% от monthly
      currency: "RUB",
      interval: "year",
      groupCode: "PRO",
      trialDays: 7,
      isActive: true,
      limits: PRO_LIMITS,
    },
  ] as const;

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      create: {
        code: plan.code,
        name: plan.name,
        type: plan.type,
        description: plan.description,
        priceCents: plan.priceCents,
        currency: plan.currency,
        interval: plan.interval,
        groupCode: plan.groupCode,
        trialDays: plan.trialDays,
        isActive: plan.isActive,
        limits: plan.limits as unknown as object,
      },
      update: {
        name: plan.name,
        type: plan.type,
        description: plan.description,
        priceCents: plan.priceCents,
        currency: plan.currency,
        interval: plan.interval,
        groupCode: plan.groupCode,
        trialDays: plan.trialDays,
        isActive: plan.isActive,
        limits: plan.limits as unknown as object,
      },
    });
  }
}
