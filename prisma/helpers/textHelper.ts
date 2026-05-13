import { PrismaPg } from "@prisma/adapter-pg";
import { Level, Prisma, PrismaClient } from "@prisma/client";
import "dotenv/config";

import { extractTextFromTiptap } from "src/common/utils/extractTextFromTiptap";
import { processText } from "./text/processText";
import { textData } from "./textData";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

export const createText = async () => {
  const user = await prisma.user.findFirst({
    where: {
      username: "tallarho",
    },
  });

  if (!user) {
    throw new Error("User 'tallarho' not found. Seed users first.");
  }

  const { pages, tags, ...textDataWithoutPages } = textData;

  const text = await prisma.$transaction(async (tx) => {
    const created = await tx.text.create({
      data: {
        ...textDataWithoutPages,
        level: textDataWithoutPages.level as Level,
        createdById: user.id,
        tags: {
          create: tags.map((tag) => ({
            tag: {
              connectOrCreate: {
                where: { name: tag.name },
                create: { name: tag.name },
              },
            },
          })),
        },
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

  console.log(`✅  Text created: ${text.id}`);
};
