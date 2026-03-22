import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, WordStatus } from "@prisma/client";
import "dotenv/config";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

export const seedUserDictionary = async () => {
  const user1 = await prisma.user.findUnique({
    where: { email: "user1@example.com" },
    select: { id: true },
  });

  if (!user1) {
    console.warn("⚠️  User dictionary seed: user1 не найден.");
    return;
  }

  // Берём доступные леммы для связи записей словаря
  const lemmas = await prisma.lemma.findMany({ take: 5, select: { id: true, baseForm: true } });

  // ─── Папки ───────────────────────────────────────────────────────────────
  const [folder1, folder2] = await Promise.all([
    prisma.userDictionaryFolder.create({
      data: { userId: user1.id, name: "Базовая лексика", sortOrder: 0 },
    }),
    prisma.userDictionaryFolder.create({
      data: { userId: user1.id, name: "Глаголы", sortOrder: 1 },
    }),
  ]);

  // ─── Записи словаря ───────────────────────────────────────────────────────
  const entries = [
    {
      word: "саг",
      normalized: "саг",
      translation: "человек",
      folderId: folder1.id,
      learningLevel: WordStatus.KNOWN,
      repetitionCount: 5,
      lemmaId: lemmas[0]?.id ?? null,
    },
    {
      word: "доттаг1",
      normalized: "доттаг1",
      translation: "друг",
      folderId: folder1.id,
      learningLevel: WordStatus.LEARNING,
      repetitionCount: 2,
      lemmaId: lemmas[1]?.id ?? null,
    },
    {
      word: "хаза",
      normalized: "хаза",
      translation: "красивый",
      folderId: folder1.id,
      learningLevel: WordStatus.NEW,
      repetitionCount: 0,
      lemmaId: lemmas[2]?.id ?? null,
    },
    {
      word: "вала",
      normalized: "вала",
      translation: "идти (о мужчине)",
      folderId: folder2.id,
      learningLevel: WordStatus.LEARNING,
      repetitionCount: 3,
      lemmaId: lemmas[3]?.id ?? null,
    },
    {
      word: "хаа",
      normalized: "хаа",
      translation: "знать",
      folderId: folder2.id,
      learningLevel: WordStatus.NEW,
      repetitionCount: 0,
      lemmaId: lemmas[4]?.id ?? null,
    },
  ];

  await prisma.userDictionaryEntry.createMany({
    data: entries.map((e) => ({ ...e, userId: user1.id })),
    skipDuplicates: true,
  });

  console.log(`✅  User dictionary seed: папок — 2, записей — ${entries.length}`);
};
