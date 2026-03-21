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
        // Чтение
        readTexts: true,         // Чтение текстов
        wordTranslation: true,   // Перевод слов по клику
        tokenAnalysis: true,     // Грамматика / базовая форма слова
        // Словарь
        personalDictionary: true,   // Личный словарь (добавление слов)
        dictionaryFolders: false,   // Папки в словаре
        // Прогресс
        textProgress: true,         // Прогресс чтения текстов (%)
        spaceRepetition: false,     // Интервальные повторения (SM-2)
        wordContexts: false,        // Контексты слов (фрагменты из текстов)
        // Аналитика
        analytics: false,           // Личная аналитика и статистика
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
        // Чтение
        readTexts: true,         // Чтение текстов
        wordTranslation: true,   // Перевод слов по клику
        tokenAnalysis: true,     // Грамматика / базовая форма слова
        // Словарь
        personalDictionary: true,   // Личный словарь (добавление слов)
        dictionaryFolders: true,    // Папки в словаре
        // Прогресс
        textProgress: true,         // Прогресс чтения текстов (%)
        spaceRepetition: true,      // Интервальные повторения (SM-2)
        wordContexts: true,         // Контексты слов (фрагменты из текстов)
        // Аналитика
        analytics: true,            // Личная аналитика и статистика
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

