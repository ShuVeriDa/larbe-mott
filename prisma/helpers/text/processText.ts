import { Prisma, PrismaClient } from "@prisma/client";
import { normalizeToken } from "src/markup-engine/tokenizer/tokenizer.utils";
import { tokenize } from "./tokenize";

const prisma = new PrismaClient();

export const processText = async (textId: string) => {
  const pages = await prisma.textPage.findMany({
    where: { textId },
    orderBy: { pageNumber: "asc" },
  });

  if (!pages.length) return;

  const latestVersion = await prisma.textProcessingVersion.findFirst({
    where: { textId },
    orderBy: { version: "desc" },
  });

  const versionNumber = (latestVersion?.version ?? 0) + 1;

  const version = await prisma.textProcessingVersion.create({
    data: {
      textId,
      version: versionNumber,
    },
  });

  let position = 0;

  const tokensToInsert: Prisma.TextTokenCreateManyInput[] = [];

  for (const page of pages) {
    const tokens = tokenize(page.contentRaw);

    for (const token of tokens) {
      tokensToInsert.push({
        versionId: version.id,
        position: position++,
        original: token.value,
        normalized: normalizeToken(token.value),
      });
    }
  }

  await prisma.textToken.createMany({
    data: tokensToInsert,
  });

  await buildVocabularyIndex(version.id);

  return version;
};

const buildVocabularyIndex = async (versionId: string) => {
  const uniqueWords = await prisma.textToken.findMany({
    where: { versionId },
    select: { normalized: true },
    distinct: ["normalized"],
  });

  return uniqueWords.map((w) => w.normalized);
};
