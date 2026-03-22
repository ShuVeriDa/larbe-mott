import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, WordStatus, Prisma } from "@prisma/client";
import "dotenv/config";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

export const seedUserProgress = async () => {
  const [user1, user2, user3] = await Promise.all([
    prisma.user.findUnique({
      where: { email: "user1@example.com" },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { email: "user2@example.com" },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { email: "user3@example.com" },
      select: { id: true },
    }),
  ]);

  if (!user1 || !user2 || !user3) {
    console.warn("⚠️  User progress seed: пользователи не найдены.");
    return;
  }

  const [texts, lemmas] = await Promise.all([
    prisma.text.findMany({ take: 1, select: { id: true } }),
    prisma.lemma.findMany({ take: 6, select: { id: true, baseForm: true } }),
  ]);

  const text1 = texts[0] ?? null;
  const now = new Date();

  // ─── Прогресс чтения текстов ──────────────────────────────────────────────
  if (text1) {
    await prisma.userTextProgress.createMany({
      data: [
        {
          userId: user1.id,
          textId: text1.id,
          progressPercent: 75,
          lastOpened: now,
        },
        {
          userId: user2.id,
          textId: text1.id,
          progressPercent: 30,
          lastOpened: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        },
        {
          userId: user3.id,
          textId: text1.id,
          progressPercent: 100,
          lastOpened: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        },
      ],
      skipDuplicates: true,
    });
  }

  // ─── Прогресс слов (SM-2 поля) ────────────────────────────────────────────
  const wordProgressData: Prisma.UserWordProgressCreateManyInput[] = [];

  // user1 — активно учит: 2 слова KNOWN, 2 слова LEARNING
  for (let i = 0; i < Math.min(4, lemmas.length); i++) {
    const isKnown = i < 2;
    wordProgressData.push({
      userId: user1.id,
      lemmaId: lemmas[i].id,
      status: isKnown ? WordStatus.KNOWN : WordStatus.LEARNING,
      seenCount: isKnown ? 12 : 4,
      repetitions: isKnown ? 5 : 2,
      easeFactor: isKnown ? 2.8 : 2.5,
      interval: isKnown ? 14 : 3,
      lastSeen: now,
      nextReview: new Date(
        now.getTime() + (isKnown ? 14 : 3) * 24 * 60 * 60 * 1000,
      ),
    });
  }

  // user2 — только начинает: 2 новых слова
  for (let i = 0; i < Math.min(2, lemmas.length); i++) {
    wordProgressData.push({
      userId: user2.id,
      lemmaId: lemmas[i].id,
      status: WordStatus.NEW,
      seenCount: 1,
      repetitions: 0,
      easeFactor: 2.5,
      interval: 0,
      lastSeen: now,
      nextReview: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    });
  }

  if (wordProgressData.length > 0) {
    await prisma.userWordProgress.createMany({
      data: wordProgressData,
      skipDuplicates: true,
    });
  }

  // ─── WordContext — где пользователь встретил слова ────────────────────────
  if (text1 && lemmas.length > 0) {
    await prisma.wordContext.createMany({
      data: lemmas.slice(0, 3).map((lemma) => ({
        userId: user1.id,
        lemmaId: lemma.id,
        textId: text1.id,
        word: lemma.baseForm,
        snippet: `...встречено слово «${lemma.baseForm}» при чтении текста...`,
      })),
      skipDuplicates: true,
    });
  }

  const textProgressCount = text1 ? 3 : 0;
  const wordProgressCount = wordProgressData.length;
  const contextCount =
    text1 && lemmas.length > 0 ? Math.min(3, lemmas.length) : 0;
  console.log(
    `✅  User progress seed: прогресс текстов — ${textProgressCount}, прогресс слов — ${wordProgressCount}, контекстов — ${contextCount}`,
  );
};
