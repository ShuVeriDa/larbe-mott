import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import { seedPlans } from "./helpers/billingHelper";
import { createText } from "./helpers/textHelper";
import { seedRolesAndPermissions } from "./helpers/rbacHelper";
import { createFakeUsers, createTallarUser } from "./helpers/userHelper";
import { seedFeedback } from "./helpers/feedbackHelper";

dotenv.config();

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function up() {
  await seedRolesAndPermissions();
  await seedPlans();
  await createTallarUser();
  await createFakeUsers();
  await createText();
  await seedFeedback();
}

async function down() {
  try {
    await prisma.$executeRaw`
      TRUNCATE TABLE
        "feedback_reaction",
        "feedback_message",
        "feedback_thread",
        "coupon_redemption",
        "coupon",
        "payment",
        "subscription",
        "plan",
        "example",
        "dictionary_cache",
        "token_analysis",
        "user_event",
        "role_permission",
        "user_role_assignment",
        "permission",
        "role",
        "user_word_progress",
        "user_text_progress",
        "text_token",
        "headword",
        "morph_form",
        "sense",
        "text_page",
        "text_processing_version",
        "dictionary_entry",
        "user_dictionary_entry",
        "user_dictionary_folder",
        "lemma",
        "unknown_word",
        "text_vocabulary",
        "text",
        "users"
      RESTART IDENTITY CASCADE
    `;
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2010" &&
      /does not exist|не существует/i.test(e.message)
    ) {
      return;
    }
    throw e;
  }
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
