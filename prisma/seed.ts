import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import { seedPlans } from "./helpers/billingHelper";
import { seedCoupons } from "./helpers/couponHelper";
import { seedDeck } from "./helpers/deckHelper";
import { seedFeatureFlags } from "./helpers/featureFlagsHelper";
import { seedFeedback } from "./helpers/feedbackHelper";
import { seedMorphologyRules } from "./helpers/morphologyHelper";
import { seedRolesAndPermissions } from "./helpers/rbacHelper";
import { seedSubscriptions } from "./helpers/subscriptionHelper";
import { createText } from "./helpers/textHelper";
import { seedUserDictionary } from "./helpers/userDictionaryHelper";
import { createFakeUsers, createTallarUser } from "./helpers/userHelper";
import { seedUserProgress } from "./helpers/userProgressHelper";

dotenv.config();

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function up() {
  // 1. Базовые справочники
  await seedRolesAndPermissions();
  await seedPlans();
  await seedMorphologyRules();

  // 2. Пользователи
  await createTallarUser();
  await createFakeUsers();

  // 3. Контент (создаёт леммы — нужно до всего, что на них ссылается)
  await createText();

  // 4. Биллинг и флаги
  await seedCoupons();
  await seedSubscriptions();
  await seedFeatureFlags();

  // 5. Пользовательские данные (зависят от лемм и текстов)
  await seedUserDictionary();
  await seedUserProgress();
  await seedDeck();

  // 6. Фидбек
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
        "user_feature_flag",
        "feature_flag",
        "morphology_rule",
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
        "user_deck_card",
        "user_deck_state",
        "word_context",
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
        "user_session",
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
