import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const FLAGS = [
  {
    key: "audio_pronunciation",
    description: "Озвучка слов при клике — TTS для чеченских слов",
    isEnabled: false,
  },
  {
    key: "ai_translation",
    description: "ИИ-ассистент для перевода и объяснения слов",
    isEnabled: false,
  },
  {
    key: "beta_deck_v2",
    description: "Новый алгоритм колод v2 (бета)",
    isEnabled: false,
  },
  {
    key: "word_frequency_hints",
    description: "Подсказки о частотности слова в языке",
    isEnabled: true,
  },
  {
    key: "export_dictionary",
    description: "Экспорт личного словаря в CSV / Anki",
    isEnabled: false,
  },
];

export const seedFeatureFlags = async () => {
  for (const flag of FLAGS) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      create: flag,
      update: { description: flag.description },
    });
  }

  // user1 получает ранний доступ к озвучке (упомянута в feedback)
  const [audioFlag, user1] = await Promise.all([
    prisma.featureFlag.findUnique({ where: { key: "audio_pronunciation" }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: "user1@example.com" }, select: { id: true } }),
  ]);

  if (audioFlag && user1) {
    await prisma.userFeatureFlag.upsert({
      where: { userId_featureFlagId: { userId: user1.id, featureFlagId: audioFlag.id } },
      create: { userId: user1.id, featureFlagId: audioFlag.id, isEnabled: true },
      update: { isEnabled: true },
    });
  }

  console.log(`✅  Feature flags seed: флагов — ${FLAGS.length}, переопределений — 1`);
};
