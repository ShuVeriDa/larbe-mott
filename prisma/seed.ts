import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import { createText } from "./helpers/textHelper";
import { createTallarUser } from "./helpers/userHelper";

const prisma = new PrismaClient();

async function up() {
  dotenv.config();
  await createTallarUser();
  await createText();
}

async function down() {
  await prisma.$executeRaw`
    TRUNCATE TABLE
      "example",
      "token_analysis",
      "user_word_progress",
      "user_text_progress",
      "text_token",
      "admin_headword",
      "admin_morph_form",
      "headword",
      "morph_form",
      "sense",
      "text_page",
      "text_processing_version",
      "admin_dictionary_entry",
      "dictionary_entry",
      "lemma",
      "unknown_word",
      "text",
      "users"
    RESTART IDENTITY CASCADE
  `;
}

async function main() {
  try {
    await down();
    await up();
  } catch (error) {
    console.error(error);
  }
}

main()
  .then(async () => await prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
