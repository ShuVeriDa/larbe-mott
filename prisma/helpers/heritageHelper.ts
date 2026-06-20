import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import "dotenv/config";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

interface LocalizedName {
  che: string;
  ru: string;
  en: string;
  [key: string]: string;
}

interface GaraData {
  slug: string;
  name: LocalizedName;
  nekyi: string[];
}

interface TaipData {
  slug: string;
  name: LocalizedName;
  garas: GaraData[];
  nekyi: string[];
}

interface TukhumData {
  slug: string;
  name: LocalizedName;
  taips: TaipData[];
}

interface SeedData {
  nation: {
    slug: string;
    name: LocalizedName;
  };
  tukhumy: TukhumData[];
  taips_without_tukhum: TaipData[];
}

const upsertGara = async (
  taip: { id: string },
  gara: GaraData,
): Promise<void> => {
  await prisma.gara.upsert({
    where: { slug: gara.slug },
    update: {
      name: gara.name,
      nekyi: gara.nekyi,
    },
    create: {
      slug: gara.slug,
      name: gara.name,
      nekyi: gara.nekyi,
      taipId: taip.id,
    },
  });
};

const upsertTaip = async (
  nation: { id: string },
  taip: TaipData,
  tukhumId: string | null,
): Promise<void> => {
  const record = await prisma.taip.upsert({
    where: { slug: taip.slug },
    update: {
      name: taip.name,
      nekyi: taip.nekyi,
      nationId: nation.id,
      tukhumId,
    },
    create: {
      slug: taip.slug,
      name: taip.name,
      nekyi: taip.nekyi,
      nationId: nation.id,
      tukhumId,
    },
  });

  for (const gara of taip.garas) {
    await upsertGara(record, gara);
  }
};

export const seedHeritage = async (): Promise<void> => {
  const dataPath = path.join(__dirname, "..", "..", "src", "heritage", "seed-data.json");
  const raw = fs.readFileSync(dataPath, "utf-8");
  const data: SeedData = JSON.parse(raw);

  const nation = await prisma.nation.upsert({
    where: { slug: data.nation.slug },
    update: { name: data.nation.name },
    create: { slug: data.nation.slug, name: data.nation.name },
  });

  for (const tukhum of data.tukhumy) {
    const tukhumRecord = await prisma.tukhum.upsert({
      where: { slug: tukhum.slug },
      update: { name: tukhum.name },
      create: {
        slug: tukhum.slug,
        name: tukhum.name,
        nationId: nation.id,
      },
    });

    for (const taip of tukhum.taips) {
      await upsertTaip(nation, taip, tukhumRecord.id);
    }
  }

  for (const taip of data.taips_without_tukhum) {
    await upsertTaip(nation, taip, null);
  }

  console.log(
    `Heritage seed: ${data.tukhumy.length} tukhumy, ` +
    `${data.tukhumy.reduce((acc, t) => acc + t.taips.length, 0) + data.taips_without_tukhum.length} taips, ` +
    `${data.taips_without_tukhum.length} taips without tukhum`,
  );
};
