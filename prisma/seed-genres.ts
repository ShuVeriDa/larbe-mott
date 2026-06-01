import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const GENRES = [
  { name: "Поэзия", slug: "poetry", sortOrder: 1 },
  { name: "Поэма", slug: "poem", sortOrder: 2 },
  { name: "Проза", slug: "prose", sortOrder: 3 },
  { name: "Рассказ", slug: "story", sortOrder: 4 },
  { name: "Повесть", slug: "novella", sortOrder: 5 },
  { name: "Роман", slug: "novel", sortOrder: 6 },
  { name: "Сказка", slug: "fairy-tale", sortOrder: 7 },
  { name: "Легенда", slug: "legend", sortOrder: 8 },
  { name: "Эпос", slug: "epic", sortOrder: 9 },
  { name: "История", slug: "history", sortOrder: 10 },
  { name: "Публицистика", slug: "journalism", sortOrder: 11 },
  { name: "Драма", slug: "drama", sortOrder: 12 },
  { name: "Басня", slug: "fable", sortOrder: 13 },
  { name: "Очерк", slug: "essay", sortOrder: 14 },
  { name: "Религия", slug: "religion", sortOrder: 15 },
];

async function main() {
  console.log("Seeding genres...");
  for (const genre of GENRES) {
    await prisma.genre.upsert({
      where: { slug: genre.slug },
      update: { name: genre.name, sortOrder: genre.sortOrder },
      create: genre,
    });
    console.log(`  ✓ ${genre.name}`);
  }
  console.log("Done.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
