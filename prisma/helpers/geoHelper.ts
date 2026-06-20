import { PrismaPg } from "@prisma/adapter-pg";
import { GeoSettlementType, PrismaClient } from "@prisma/client";
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
}

interface SettlementSeed {
  name: LocalizedName;
  type: GeoSettlementType;
}

interface DistrictSeed {
  name: LocalizedName;
  settlements: SettlementSeed[];
}

interface RegionSeed {
  name: LocalizedName;
  districts: DistrictSeed[];
}

interface CountrySeed {
  code: string;
  name: LocalizedName;
  regions: RegionSeed[];
}

const GEO_DATA: CountrySeed[] = [
  {
    code: "RU",
    name: { che: "Росси", ru: "Россия", en: "Russia" },
    regions: [
      {
        name: { che: "Нохчийчоь", ru: "Чеченская Республика", en: "Chechen Republic" },
        districts: [
          {
            name: { che: "Грозни", ru: "Грозненский район", en: "Grozny District" },
            settlements: [
              { name: { che: "Соьлжа-ГIала", ru: "Грозный", en: "Grozny" }, type: GeoSettlementType.city },
              { name: { che: "Новые Атаги", ru: "Новые Атаги", en: "Novye Atagi" }, type: GeoSettlementType.village },
              { name: { che: "Чернокозово", ru: "Чернокозово", en: "Chernokozovo" }, type: GeoSettlementType.village },
            ],
          },
          {
            name: { che: "Шелан", ru: "Шалинский район", en: "Shali District" },
            settlements: [
              { name: { che: "Шела", ru: "Шали", en: "Shali" }, type: GeoSettlementType.city },
              { name: { che: "Автуры", ru: "Автуры", en: "Avtury" }, type: GeoSettlementType.village },
              { name: { che: "Мескер-Юрт", ru: "Мескер-Юрт", en: "Mesker-Yurt" }, type: GeoSettlementType.village },
            ],
          },
          {
            name: { che: "Гудермесан", ru: "Гудермесский район", en: "Gudermes District" },
            settlements: [
              { name: { che: "Гудермес", ru: "Гудермес", en: "Gudermes" }, type: GeoSettlementType.city },
              { name: { che: "Энгель-Юрт", ru: "Энгель-Юрт", en: "Engel-Yurt" }, type: GeoSettlementType.village },
            ],
          },
          {
            name: { che: "Урус-Мартан", ru: "Урус-Мартановский район", en: "Urus-Martan District" },
            settlements: [
              { name: { che: "Урус-Мартан", ru: "Урус-Мартан", en: "Urus-Martan" }, type: GeoSettlementType.city },
              { name: { che: "Гехи", ru: "Гехи", en: "Gekhi" }, type: GeoSettlementType.village },
              { name: { che: "Рошни-Чу", ru: "Рошни-Чу", en: "Roshni-Chu" }, type: GeoSettlementType.village },
            ],
          },
          {
            name: { che: "Наурский район", ru: "Наурский район", en: "Naur District" },
            settlements: [
              { name: { che: "Наур", ru: "Наурская", en: "Naurskaya" }, type: GeoSettlementType.village },
              { name: { che: "Мекен-Юрт", ru: "Мекенская", en: "Mekenskaya" }, type: GeoSettlementType.village },
            ],
          },
          {
            name: { che: "Ножай-Юртан", ru: "Ножай-Юртовский район", en: "Nozhai-Yurt District" },
            settlements: [
              { name: { che: "Ножай-Юрт", ru: "Ножай-Юрт", en: "Nozhai-Yurt" }, type: GeoSettlementType.village },
              { name: { che: "Гордали", ru: "Гордали", en: "Gordali" }, type: GeoSettlementType.village },
            ],
          },
          {
            name: { che: "Итум-Калинский район", ru: "Итум-Калинский район", en: "Itum-Kali District" },
            settlements: [
              { name: { che: "Итум-Кали", ru: "Итум-Кали", en: "Itum-Kali" }, type: GeoSettlementType.village },
              { name: { che: "Шаро-Аргун", ru: "Шаро-Аргун", en: "Sharo-Argun" }, type: GeoSettlementType.village },
            ],
          },
          {
            name: { che: "Веданский район", ru: "Веденский район", en: "Vedeno District" },
            settlements: [
              { name: { che: "Ведено", ru: "Ведено", en: "Vedeno" }, type: GeoSettlementType.village },
              { name: { che: "Хатуни", ru: "Хатуни", en: "Khatuni" }, type: GeoSettlementType.village },
            ],
          },
          {
            name: { che: "Шатойский район", ru: "Шатойский район", en: "Shatoy District" },
            settlements: [
              { name: { che: "Шатой", ru: "Шатой", en: "Shatoy" }, type: GeoSettlementType.village },
            ],
          },
          {
            name: { che: "АчхойМартановский район", ru: "Ачхой-Мартановский район", en: "Achkhoy-Martan District" },
            settlements: [
              { name: { che: "АчхойМартан", ru: "Ачхой-Мартан", en: "Achkhoy-Martan" }, type: GeoSettlementType.village },
              { name: { che: "Катыр-Юрт", ru: "Катыр-Юрт", en: "Katyr-Yurt" }, type: GeoSettlementType.village },
            ],
          },
          {
            name: { che: "Курчалойский район", ru: "Курчалойский район", en: "Kurchaloy District" },
            settlements: [
              { name: { che: "Курчалой", ru: "Курчалой", en: "Kurchaloy" }, type: GeoSettlementType.village },
              { name: { che: "Центорой", ru: "Центорой", en: "Tsentoroy" }, type: GeoSettlementType.village },
            ],
          },
        ],
      },
      {
        name: { che: "Ингушетия", ru: "Республика Ингушетия", en: "Republic of Ingushetia" },
        districts: [
          {
            name: { che: "Магасан", ru: "Магасский район", en: "Magas District" },
            settlements: [
              { name: { che: "Магас", ru: "Магас", en: "Magas" }, type: GeoSettlementType.city },
              { name: { che: "Назрань", ru: "Назрань", en: "Nazran" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
      {
        name: { che: "Дагестан", ru: "Республика Дагестан", en: "Republic of Dagestan" },
        districts: [
          {
            name: { che: "Хасавюрт", ru: "Хасавюртовский район", en: "Khasavyurt District" },
            settlements: [
              { name: { che: "Хасавюрт", ru: "Хасавюрт", en: "Khasavyurt" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
      {
        name: { che: "Москох", ru: "Москва", en: "Moscow" },
        districts: [
          {
            name: { che: "Москох", ru: "Москва (город)", en: "Moscow City" },
            settlements: [
              { name: { che: "Москох", ru: "Москва", en: "Moscow" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
      {
        name: { che: "Санкт-Петербург", ru: "Санкт-Петербург", en: "Saint Petersburg" },
        districts: [
          {
            name: { che: "Санкт-Петербург", ru: "Санкт-Петербург (город)", en: "Saint Petersburg City" },
            settlements: [
              { name: { che: "Санкт-Петербург", ru: "Санкт-Петербург", en: "Saint Petersburg" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
      {
        name: { che: "Тюмень", ru: "Тюменская область", en: "Tyumen Oblast" },
        districts: [
          {
            name: { che: "Тюмень", ru: "Тюмень (город)", en: "Tyumen City" },
            settlements: [
              { name: { che: "Тюмень", ru: "Тюмень", en: "Tyumen" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "KZ",
    name: { che: "Казахстан", ru: "Казахстан", en: "Kazakhstan" },
    regions: [
      {
        name: { che: "Алма-Атта", ru: "Алматинская область", en: "Almaty Region" },
        districts: [
          {
            name: { che: "Алма-Атта", ru: "Алматы (город)", en: "Almaty City" },
            settlements: [
              { name: { che: "Алма-Атта", ru: "Алматы", en: "Almaty" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
      {
        name: { che: "Астана", ru: "Акмолинская область", en: "Akmola Region" },
        districts: [
          {
            name: { che: "Астана", ru: "Астана (город)", en: "Astana City" },
            settlements: [
              { name: { che: "Астана", ru: "Астана", en: "Astana" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "DE",
    name: { che: "Германи", ru: "Германия", en: "Germany" },
    regions: [
      {
        name: { che: "Бавари", ru: "Бавария", en: "Bavaria" },
        districts: [
          {
            name: { che: "Мюнхен", ru: "Мюнхен", en: "Munich" },
            settlements: [
              { name: { che: "Мюнхен", ru: "Мюнхен", en: "Munich" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
      {
        name: { che: "Берлин", ru: "Берлин", en: "Berlin" },
        districts: [
          {
            name: { che: "Берлин", ru: "Берлин (город)", en: "Berlin City" },
            settlements: [
              { name: { che: "Берлин", ru: "Берлин", en: "Berlin" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
      {
        name: { che: "Северный Рейн-Вестфалия", ru: "Северный Рейн-Вестфалия", en: "North Rhine-Westphalia" },
        districts: [
          {
            name: { che: "Кёльн", ru: "Кёльн", en: "Cologne" },
            settlements: [
              { name: { che: "Кёльн", ru: "Кёльн", en: "Cologne" }, type: GeoSettlementType.city },
            ],
          },
          {
            name: { che: "Дюссельдорф", ru: "Дюссельдорф", en: "Düsseldorf" },
            settlements: [
              { name: { che: "Дюссельдорф", ru: "Дюссельдорф", en: "Düsseldorf" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "TR",
    name: { che: "Туркойчоь", ru: "Турция", en: "Turkey" },
    regions: [
      {
        name: { che: "Истанбул", ru: "Стамбул", en: "Istanbul" },
        districts: [
          {
            name: { che: "Истанбул", ru: "Стамбул (город)", en: "Istanbul City" },
            settlements: [
              { name: { che: "Истанбул", ru: "Стамбул", en: "Istanbul" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
      {
        name: { che: "Анкара", ru: "Анкара", en: "Ankara" },
        districts: [
          {
            name: { che: "Анкара", ru: "Анкара (город)", en: "Ankara City" },
            settlements: [
              { name: { che: "Анкара", ru: "Анкара", en: "Ankara" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
      {
        name: { che: "Саkarya", ru: "Сакарья", en: "Sakarya" },
        districts: [
          {
            name: { che: "Адапазары", ru: "Адапазары", en: "Adapazarı" },
            settlements: [
              { name: { che: "Адапазары", ru: "Адапазары", en: "Adapazarı" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "AT",
    name: { che: "Австри", ru: "Австрия", en: "Austria" },
    regions: [
      {
        name: { che: "Вена", ru: "Вена", en: "Vienna" },
        districts: [
          {
            name: { che: "Вена", ru: "Вена (город)", en: "Vienna City" },
            settlements: [
              { name: { che: "Вена", ru: "Вена", en: "Vienna" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "NO",
    name: { che: "Норвегия", ru: "Норвегия", en: "Norway" },
    regions: [
      {
        name: { che: "Осло", ru: "Осло", en: "Oslo" },
        districts: [
          {
            name: { che: "Осло", ru: "Осло (город)", en: "Oslo City" },
            settlements: [
              { name: { che: "Осло", ru: "Осло", en: "Oslo" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "FR",
    name: { che: "Франци", ru: "Франция", en: "France" },
    regions: [
      {
        name: { che: "Париж", ru: "Иль-де-Франс", en: "Île-de-France" },
        districts: [
          {
            name: { che: "Париж", ru: "Париж (город)", en: "Paris City" },
            settlements: [
              { name: { che: "Париж", ru: "Париж", en: "Paris" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "BE",
    name: { che: "Бельгия", ru: "Бельгия", en: "Belgium" },
    regions: [
      {
        name: { che: "Брюссель", ru: "Брюссель", en: "Brussels" },
        districts: [
          {
            name: { che: "Брюссель", ru: "Брюссель (город)", en: "Brussels City" },
            settlements: [
              { name: { che: "Брюссель", ru: "Брюссель", en: "Brussels" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "UA",
    name: { che: "Украина", ru: "Украина", en: "Ukraine" },
    regions: [
      {
        name: { che: "Киев", ru: "Киевская область", en: "Kyiv Oblast" },
        districts: [
          {
            name: { che: "Киев", ru: "Киев (город)", en: "Kyiv City" },
            settlements: [
              { name: { che: "Киев", ru: "Киев", en: "Kyiv" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "PL",
    name: { che: "Польша", ru: "Польша", en: "Poland" },
    regions: [
      {
        name: { che: "Варшава", ru: "Мазовецкое воеводство", en: "Masovian Voivodeship" },
        districts: [
          {
            name: { che: "Варшава", ru: "Варшава (город)", en: "Warsaw City" },
            settlements: [
              { name: { che: "Варшава", ru: "Варшава", en: "Warsaw" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "AE",
    name: { che: "ОАЭ", ru: "ОАЭ", en: "UAE" },
    regions: [
      {
        name: { che: "Дубай", ru: "Дубай", en: "Dubai" },
        districts: [
          {
            name: { che: "Дубай", ru: "Дубай (город)", en: "Dubai City" },
            settlements: [
              { name: { che: "Дубай", ru: "Дубай", en: "Dubai" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
      {
        name: { che: "Абу-Даби", ru: "Абу-Даби", en: "Abu Dhabi" },
        districts: [
          {
            name: { che: "Абу-Даби", ru: "Абу-Даби (город)", en: "Abu Dhabi City" },
            settlements: [
              { name: { che: "Абу-Даби", ru: "Абу-Даби", en: "Abu Dhabi" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "GE",
    name: { che: "Гуьржийчоь", ru: "Грузия", en: "Georgia" },
    regions: [
      {
        name: { che: "Тбилиси", ru: "Тбилиси", en: "Tbilisi" },
        districts: [
          {
            name: { che: "Тбилиси", ru: "Тбилиси (город)", en: "Tbilisi City" },
            settlements: [
              { name: { che: "Тбилиси", ru: "Тбилиси", en: "Tbilisi" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
      {
        name: { che: "Панкиси", ru: "Ахметский муниципалитет", en: "Akhmeta Municipality" },
        districts: [
          {
            name: { che: "Панкиси", ru: "Панкисское ущелье", en: "Pankisi Gorge" },
            settlements: [
              { name: { che: "Дуиси", ru: "Дуиси", en: "Duisi" }, type: GeoSettlementType.village },
              { name: { che: "Джоколо", ru: "Джоколо", en: "Jokolo" }, type: GeoSettlementType.village },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "JO",
    name: { che: "Иордани", ru: "Иордания", en: "Jordan" },
    regions: [
      {
        name: { che: "Амман", ru: "Амман", en: "Amman" },
        districts: [
          {
            name: { che: "Амман", ru: "Амман (город)", en: "Amman City" },
            settlements: [
              { name: { che: "Амман", ru: "Амман", en: "Amman" }, type: GeoSettlementType.city },
              { name: { che: "Зарка", ru: "Зарка", en: "Zarqa" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "US",
    name: { che: "США", ru: "США", en: "USA" },
    regions: [
      {
        name: { che: "Иллинойс", ru: "Иллинойс", en: "Illinois" },
        districts: [
          {
            name: { che: "Чикаго", ru: "Чикаго", en: "Chicago" },
            settlements: [
              { name: { che: "Чикаго", ru: "Чикаго", en: "Chicago" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
      {
        name: { che: "Нью-Йорк", ru: "Нью-Йорк", en: "New York" },
        districts: [
          {
            name: { che: "Нью-Йорк", ru: "Нью-Йорк (город)", en: "New York City" },
            settlements: [
              { name: { che: "Нью-Йорк", ru: "Нью-Йорк", en: "New York" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
    ],
  },
];

export async function seedGeo() {
  console.log("Seeding geo data...");

  for (const countryData of GEO_DATA) {
    const country = await prisma.geoCountry.upsert({
      where: { code: countryData.code },
      update: { name: countryData.name as object },
      create: { code: countryData.code, name: countryData.name as object },
    });

    for (const regionData of countryData.regions) {
      const region = await prisma.geoRegion.create({
        data: { countryId: country.id, name: regionData.name as object },
      });

      for (const districtData of regionData.districts) {
        const district = await prisma.geoDistrict.create({
          data: { regionId: region.id, name: districtData.name as object },
        });

        for (const settlementData of districtData.settlements) {
          await prisma.geoSettlement.create({
            data: {
              districtId: district.id,
              name: settlementData.name as object,
              type: settlementData.type,
            },
          });
        }
      }
    }

    console.log(`  ✓ ${countryData.name.ru} (${countryData.code})`);
  }

  console.log("Geo seed complete.");
}
