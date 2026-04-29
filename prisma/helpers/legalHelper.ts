import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const DEFAULTS: Array<{
  slug: string;
  lang: string;
  title: string;
  content: string;
}> = [
  {
    slug: "privacy",
    lang: "ru",
    title: "Политика конфиденциальности",
    content:
      "# Политика конфиденциальности\n\n" +
      "_Заглушка-документ. Замените реальным текстом перед публичным запуском._\n\n" +
      "## Какие данные мы собираем\n\nТекст черновика…\n\n" +
      "## Как мы используем данные\n\nТекст черновика…\n",
  },
  {
    slug: "terms",
    lang: "ru",
    title: "Условия использования",
    content:
      "# Условия использования\n\n" +
      "_Заглушка-документ. Замените реальным текстом перед публичным запуском._\n\n" +
      "## Принятие условий\n\nТекст черновика…\n",
  },
  {
    slug: "contact",
    lang: "ru",
    title: "Контакты",
    content:
      "# Связаться с нами\n\n" +
      "Напишите нам на support@mott-larbe.ru — мы отвечаем в течение рабочего дня.\n",
  },
];

export async function seedLegalDocuments() {
  for (const doc of DEFAULTS) {
    await prisma.legalDocument.upsert({
      where: { slug_lang: { slug: doc.slug, lang: doc.lang } },
      create: {
        slug: doc.slug,
        lang: doc.lang,
        title: doc.title,
        content: doc.content,
        isPublished: true,
        publishedAt: new Date(),
      },
      // На повторных сидах не перезатираем content — у админов могут быть правки.
      update: {},
    });
  }
}
