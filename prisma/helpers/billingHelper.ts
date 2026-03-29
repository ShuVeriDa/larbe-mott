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

export async function seedPlans() {
  const plans = [
    {
      code: "FREE",
      name: "Free",
      type: PlanType.FREE,
      priceCents: 0,
      currency: "USD",
      interval: null,
      isActive: true,
      limits: {
        // Числовые лимиты
        translationsPerDay: 50,
        wordsInDictionary: 500,
        availableTexts: 20,
        statisticsDays: -1,
        // Чтение
        readTexts: true,
        wordTranslation: true,
        tokenAnalysis: true,
        // Словарь
        personalDictionary: true,
        dictionaryFolders: false,
        // Прогресс
        textProgress: true,
        spaceRepetition: false,
        hasFlashcards: false,
        wordContexts: false,
        // Аналитика
        analytics: false,
        hasAdvancedAnalytics: false,
        // Поддержка
        hasPrioritySupport: false,
      } satisfies PlanLimits,
    },
    {
      code: "PREMIUM_MONTHLY",
      name: "Premium",
      type: PlanType.PREMIUM,
      priceCents: 999,
      currency: "USD",
      interval: "month",
      isActive: true,
      limits: {
        // Числовые лимиты
        translationsPerDay: -1,
        wordsInDictionary: -1,
        availableTexts: -1,
        statisticsDays: -1,
        // Чтение
        readTexts: true,
        wordTranslation: true,
        tokenAnalysis: true,
        // Словарь
        personalDictionary: true,
        dictionaryFolders: true,
        // Прогресс
        textProgress: true,
        spaceRepetition: true,
        hasFlashcards: true,
        wordContexts: true,
        // Аналитика
        analytics: true,
        hasAdvancedAnalytics: true,
        // Поддержка
        hasPrioritySupport: true,
      } satisfies PlanLimits,
    },
  ] as const;

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      create: plan,
      update: {
        name: plan.name,
        type: plan.type,
        priceCents: plan.priceCents,
        currency: plan.currency,
        interval: plan.interval,
        isActive: plan.isActive,
        limits: plan.limits as any,
      },
    });
  }
}

