import { PrismaPg } from "@prisma/adapter-pg";
import { DeckType, PrismaClient } from "@prisma/client";
import "dotenv/config";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

export const seedDeck = async () => {
  const user1 = await prisma.user.findUnique({
    where: { email: "user1@example.com" },
    select: { id: true },
  });

  if (!user1) {
    console.warn("⚠️  Deck seed: user1 не найден.");
    return;
  }

  const lemmas = await prisma.lemma.findMany({ take: 8, select: { id: true } });

  if (lemmas.length === 0) {
    console.warn("⚠️  Deck seed: леммы не найдены, пропускаем.");
    return;
  }

  // Инициализируем состояние колоды
  await prisma.userDeckState.upsert({
    where: { userId: user1.id },
    create: { userId: user1.id, currentNumberedDeck: 1, lastRotatedAt: new Date() },
    update: { lastRotatedAt: new Date() },
  });

  // Распределяем леммы по типам колод:
  //   0-2 → NEW (ещё не учил)
  //   3-5 → OLD (повторяет)
  //   6+  → NUMBERED (в нумерованных колодах)
  const cards = lemmas.map((lemma, i) => ({
    userId: user1.id,
    lemmaId: lemma.id,
    deckType: i < 3 ? DeckType.NEW : i < 6 ? DeckType.OLD : DeckType.NUMBERED,
    deckNumber: i >= 6 ? 1 : null,
  }));

  await prisma.userDeckCard.createMany({
    data: cards,
    skipDuplicates: true,
  });

  console.log(`✅  Deck seed: state — 1, карточек — ${cards.length}`);
};
