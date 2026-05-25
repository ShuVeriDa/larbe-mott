/**
 * Diagnose why tokens don't get lemmaId after tokenization.
 * Run: npx tsx scripts/diagnose-lemma-coverage.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter, log: [] });

async function main() {
  // 1. Count lemmas and headwords
  const [lemmaCount, headwordCount, morphFormCount] = await Promise.all([
    prisma.lemma.count(),
    prisma.headword.count(),
    prisma.morphForm.count(),
  ]);
  console.log("\n=== Dictionary ===");
  console.log(`Lemmas:     ${lemmaCount}`);
  console.log(`Headwords:  ${headwordCount}`);
  console.log(`MorphForms: ${morphFormCount}`);

  // 2. Latest text with tokens
  const latestVersion = await prisma.textProcessingVersion.findFirst({
    where: { isCurrent: true, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    include: { text: { select: { title: true } } },
  });
  if (!latestVersion) {
    console.log("\nNo completed processing version found.");
    return;
  }
  console.log(`\n=== Latest text: "${latestVersion.text.title}" (versionId: ${latestVersion.id}) ===`);
  console.log(`  useMorphAnalysis: ${latestVersion.useMorphAnalysis}`);

  // 3. Token / analysis counts
  const [totalTokens, tokensWithAnalysis, tokensWithLemmaId] = await Promise.all([
    prisma.textToken.count({ where: { versionId: latestVersion.id } }),
    prisma.textToken.count({ where: { versionId: latestVersion.id, analyses: { some: {} } } }),
    prisma.textToken.count({ where: { versionId: latestVersion.id, analyses: { some: { lemmaId: { not: null }, isPrimary: true } } } }),
  ]);
  console.log(`\n  Total tokens:           ${totalTokens}`);
  console.log(`  Tokens with analysis:   ${tokensWithAnalysis}`);
  console.log(`  Tokens with lemmaId:    ${tokensWithLemmaId}`);
  console.log(`  Tokens without lemmaId: ${totalTokens - tokensWithLemmaId}`);

  // 4. Sample tokens WITHOUT lemmaId
  const sampleNoLemma = await prisma.textToken.findMany({
    where: {
      versionId: latestVersion.id,
      analyses: { none: { lemmaId: { not: null }, isPrimary: true } },
    },
    select: { original: true, normalized: true },
    take: 20,
    orderBy: { position: "asc" },
  });
  console.log(`\n  Sample tokens WITHOUT lemmaId (first 20):`);
  for (const t of sampleNoLemma) {
    console.log(`    original="${t.original}"  normalized="${t.normalized}"`);
  }

  // 5. Check if those normalized forms exist in Headword table
  if (sampleNoLemma.length > 0) {
    const normalizedForms = sampleNoLemma.map(t => t.normalized);
    const matchingHeadwords = await prisma.headword.findMany({
      where: { normalized: { in: normalizedForms } },
      select: { normalized: true, lemmaId: true, lemma: { select: { baseForm: true, language: true } } },
    });
    const matchingMorphForms = await prisma.morphForm.findMany({
      where: { normalized: { in: normalizedForms } },
      select: { normalized: true, lemmaId: true, lemma: { select: { baseForm: true } } },
    });

    console.log(`\n  Of those, found in Headword table: ${matchingHeadwords.length}`);
    for (const h of matchingHeadwords) {
      console.log(`    normalized="${h.normalized}" → lemma="${h.lemma?.baseForm}" (${h.lemma?.language})`);
    }
    console.log(`  Found in MorphForm table: ${matchingMorphForms.length}`);
    for (const m of matchingMorphForms) {
      console.log(`    normalized="${m.normalized}" → lemma="${m.lemma?.baseForm}"`);
    }

    // 6. Sample a specific word — check exact bytes
    const firstToken = sampleNoLemma[0];
    if (firstToken) {
      console.log(`\n  === Deep check for token: original="${firstToken.original}" normalized="${firstToken.normalized}" ===`);
      console.log(`  normalized bytes: ${Buffer.from(firstToken.normalized).toString("hex")}`);

      // Case-insensitive search
      const insensitiveMatch = await prisma.headword.findFirst({
        where: { normalized: { equals: firstToken.normalized, mode: "insensitive" } },
        select: { normalized: true, lemmaId: true },
      });
      console.log(`  Headword case-insensitive match: ${insensitiveMatch ? `YES → lemmaId=${insensitiveMatch.lemmaId}` : "NO"}`);

      // Raw contains search
      const containsMatch = await prisma.headword.findFirst({
        where: { normalized: { contains: firstToken.normalized } },
        select: { normalized: true, lemmaId: true },
      });
      console.log(`  Headword contains match: ${containsMatch ? `YES normalized="${containsMatch.normalized}"` : "NO"}`);
    }
  }

  // 7. All 15 lemmas
  const allLemmas = await prisma.lemma.findMany({
    include: {
      headwords: { select: { id: true, text: true, normalized: true } },
      morphForms: { select: { form: true, normalized: true } },
    },
  });
  console.log(`\n=== All lemmas ===`);
  for (const l of allLemmas) {
    console.log(`  baseForm="${l.baseForm}" normalized="${l.normalized}" headwords=${l.headwords.length} morphForms=${l.morphForms.length}`);
    if (l.morphForms.length) {
      for (const mf of l.morphForms) {
        console.log(`    morphForm: form="${mf.form}" normalized="${mf.normalized}"`);
      }
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
