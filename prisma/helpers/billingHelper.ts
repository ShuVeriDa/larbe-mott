import { PrismaPg } from "@prisma/adapter-pg";
import { PlanType, PrismaClient } from "@prisma/client";
import "dotenv/config";

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
        texts: 5,
        dictionary: "limited",
        offline: false,
        importTexts: false,
        aiTranslation: false,
      },
    },
    {
      code: "BASIC_MONTHLY",
      name: "Basic",
      type: PlanType.BASIC,
      priceCents: 999,
      currency: "USD",
      interval: "month",
      isActive: true,
      limits: {
        texts: 50,
        dictionary: "full",
        offline: false,
        importTexts: true,
        aiTranslation: false,
      },
    },
    {
      code: "PRO_MONTHLY",
      name: "Pro",
      type: PlanType.PRO,
      priceCents: 1999,
      currency: "USD",
      interval: "month",
      isActive: true,
      limits: {
        texts: "unlimited",
        dictionary: "full",
        offline: true,
        importTexts: true,
        aiTranslation: true,
      },
    },
    {
      code: "PREMIUM_MONTHLY",
      name: "Premium",
      type: PlanType.PREMIUM,
      priceCents: 2999,
      currency: "USD",
      interval: "month",
      isActive: true,
      limits: {
        texts: "unlimited",
        dictionary: "full",
        offline: true,
        importTexts: true,
        aiTranslation: true,
        advancedStatistics: true,
      },
    },
    {
      code: "LIFETIME",
      name: "Lifetime",
      type: PlanType.LIFETIME,
      priceCents: 19900,
      currency: "USD",
      interval: null,
      isActive: true,
      limits: {
        texts: "unlimited",
        dictionary: "full",
        offline: true,
        importTexts: true,
        aiTranslation: true,
        advancedStatistics: true,
      },
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

