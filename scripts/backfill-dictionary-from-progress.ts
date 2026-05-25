/**
 * Backfill: creates UserDictionaryEntry for every UserWordProgress with status LEARNING
 * that does not already have a matching entry (matched by userId + lemmaId).
 *
 * Safe to run multiple times (idempotent).
 * Run: npx tsx scripts/backfill-dictionary-from-progress.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BATCH_SIZE = 200;

async function main() {
  console.log("Starting backfill: UserWordProgress(LEARNING) → UserDictionaryEntry");

  let offset = 0;
  let totalCreated = 0;
  let totalSkipped = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const progressRows = await prisma.userWordProgress.findMany({
      where: { status: { in: ["LEARNING", "KNOWN"] } },
      select: {
        userId: true,
        lemmaId: true,
        status: true,
        lemma: {
          select: {
            baseForm: true,
            normalized: true,
            level: true,
            headwords: {
              take: 1,
              orderBy: { order: "asc" },
              include: { entry: { select: { rawTranslate: true } } },
            },
          },
        },
      },
      skip: offset,
      take: BATCH_SIZE,
      orderBy: [{ userId: "asc" }, { lemmaId: "asc" }],
    });

    if (progressRows.length === 0) break;

    for (const row of progressRows) {
      const { userId, lemmaId, status, lemma } = row;
      if (!lemma) { totalSkipped++; continue; }

      // Check existing entry
      const existing = await prisma.userDictionaryEntry.findFirst({
        where: { userId, lemmaId },
        select: { id: true },
      });
      if (existing) { totalSkipped++; continue; }

      // Resolve translation
      let translation: string | null =
        (lemma.headwords[0]?.entry as { rawTranslate?: string } | undefined)
          ?.rawTranslate ?? null;

      if (!translation) {
        const cache = await prisma.dictionaryCache.findFirst({
          where: { normalized: lemma.normalized },
          select: { translation: true },
        });
        translation = cache?.translation ?? null;
      }

      if (!translation) { totalSkipped++; continue; }

      try {
        await prisma.userDictionaryEntry.create({
          data: {
            userId,
            lemmaId,
            word: lemma.baseForm,
            normalized: lemma.normalized,
            translation,
            learningLevel: status as "LEARNING" | "KNOWN",
            cefrLevel: lemma.level ?? null,
          },
        });
        totalCreated++;
      } catch {
        // Unique constraint = race or duplicate normalized — skip silently
        totalSkipped++;
      }
    }

    offset += BATCH_SIZE;
    console.log(`  processed ${offset}, created ${totalCreated}, skipped ${totalSkipped}`);
  }

  console.log(`Done. Created: ${totalCreated}, Skipped: ${totalSkipped}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
