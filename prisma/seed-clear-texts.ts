import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

/**
 * Удаляет все тексты и связанные с ними данные:
 * - user_text_progress
 * - token_analysis
 * - text_token
 * - text_processing_version
 * - text_page
 * - text
 */
async function clearAllTexts() {
  await prisma.$executeRaw`
    TRUNCATE TABLE
      "token_analysis",
      "user_text_progress",
      "text_token",
      "text_processing_version",
      "text_page",
      "text"
    RESTART IDENTITY CASCADE
  `;
  console.log("All texts and related data have been deleted.");
}

clearAllTexts()
  .then(async () => await prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
