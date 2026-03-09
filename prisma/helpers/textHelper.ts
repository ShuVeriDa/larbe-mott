import { Level, Prisma, PrismaClient } from "@prisma/client";
import { extractTextFromTiptap } from "src/common/utils/extractTextFromTiptap";
import { processText } from "./text/processText";
import { textData } from "./textData";

const prisma = new PrismaClient();

export const createChats = async () => {
  const user = await prisma.user.findFirst({
    where: {
      username: "tallar",
    },
  });

  if (!user) {
    throw new Error("User 'tallar' not found. Seed users first.");
  }

  const { pages, ...textDataWithoutPages } = textData;

  const text = await prisma.$transaction(async (tx) => {
    const created = await tx.text.create({
      data: {
        ...textDataWithoutPages,
        level: textDataWithoutPages.level as Level,
        createdById: user.id,
      },
    });

    for (const page of textData.pages) {
      const contentRaw = extractTextFromTiptap(page.contentRich);

      await tx.textPage.create({
        data: {
          textId: created.id,
          pageNumber: page.pageNumber,
          contentRich: page.contentRich as Prisma.InputJsonValue,
          contentRaw,
        },
      });
    }

    return tx.text.findUniqueOrThrow({
      where: { id: created.id },
      include: { pages: true },
    });
  });

  await processText(text.id);

  return text;
};
