import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const [lemmas, entries, headwords, morphForms, dictionaryCache, unknownWords] = await Promise.all([
    prisma.lemma.count(),
    prisma.dictionaryEntry.count(),
    prisma.headword.count(),
    prisma.morphForm.count(),
    prisma.dictionaryCache.count(),
    prisma.unknownWord.count(),
  ]);
  console.log("lemma:          ", lemmas);
  console.log("dictionaryEntry:", entries);
  console.log("headword:       ", headwords);
  console.log("morphForm:      ", morphForms);
  console.log("dictionaryCache:", dictionaryCache);
  console.log("unknownWord:    ", unknownWords);

  const cache = await prisma.dictionaryCache.findMany({ take: 5, select: { normalized: true, translation: true, lemmaId: true } });
  console.log("\nSample dictionaryCache:");
  for (const c of cache) console.log(" ", JSON.stringify(c));

  const unknown = await prisma.unknownWord.findMany({ take: 10, select: { normalized: true, seenCount: true } });
  console.log("\nSample unknownWords:");
  for (const u of unknown) console.log(" ", JSON.stringify(u));
}
main().catch(console.error).finally(() => prisma.$disconnect());
