import { PrismaPg } from "@prisma/adapter-pg";
import { Language, PrismaClient } from "@prisma/client";
import "dotenv/config";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

export const seedPhrasebook = async () => {
  // ── Категории ──────────────────────────────────────────────────────────
  const categories = await prisma.phrasebookCategory.createManyAndReturn({
    data: [
      { emoji: "👋", name: "Приветствия",      sortOrder: 0 },
      { emoji: "🤝", name: "Знакомство",        sortOrder: 1 },
      { emoji: "🙏", name: "Благодарность",     sortOrder: 2 },
      { emoji: "❓", name: "Вопросы",            sortOrder: 3 },
      { emoji: "🔢", name: "Числа и время",      sortOrder: 4 },
      { emoji: "🗺️", name: "Направления",       sortOrder: 5 },
      { emoji: "🍽️", name: "Еда и напитки",     sortOrder: 6 },
      { emoji: "💬", name: "Эмоции",             sortOrder: 7 },
    ],
    skipDuplicates: false,
  });

  const catMap = Object.fromEntries(categories.map((c) => [c.name, c.id]));

  // ── Фразы ───────────────────────────────────────────────────────────────
  const phrasesData = [
    // Приветствия
    {
      categoryId: catMap["Приветствия"],
      original: "Салам!",
      transliteration: "Salam!",
      translation: "Привет! / Здравствуй!",
      lang: Language.CHE,
      sortOrder: 0,
      words: [{ original: "Салам", translation: "привет", position: 0 }],
      examples: [
        {
          phrase: "Салам! Мухa ду хьо?",
          translation: "Привет! Как ты?",
          context: "Неформальное приветствие",
        },
      ],
    },
    {
      categoryId: catMap["Приветствия"],
      original: "Маршалла ду хьуна!",
      transliteration: "Marshalla du xhuna!",
      translation: "Здравствуй! (букв. «Пусть будет мир тебе»)",
      lang: Language.CHE,
      sortOrder: 1,
      words: [
        { original: "Маршалла", translation: "мир/покой", position: 0 },
        { original: "ду", translation: "есть", position: 1 },
        { original: "хьуна", translation: "тебе", position: 2 },
      ],
      examples: [
        {
          phrase: "Маршалла ду хьуна, ваша!",
          translation: "Здравствуй, брат!",
          context: "Уважительное приветствие",
        },
      ],
    },
    {
      categoryId: catMap["Приветствия"],
      original: "Де дика хьулда!",
      transliteration: "De dika xhulda!",
      translation: "Добрый день! (букв. «Пусть день будет добрым»)",
      lang: Language.CHE,
      sortOrder: 2,
      words: [
        { original: "Де", translation: "день", position: 0 },
        { original: "дика", translation: "добрый/хороший", position: 1 },
        { original: "хьулда", translation: "пусть будет", position: 2 },
      ],
      examples: [
        {
          phrase: "Де дика хьулда, ден нана!",
          translation: "Добрый день, мама!",
          context: "Приветствие старших",
        },
      ],
    },
    {
      categoryId: catMap["Приветствия"],
      original: "Буьйса дика хьулда!",
      transliteration: "B'uysa dika xhulda!",
      translation: "Доброй ночи!",
      lang: Language.CHE,
      sortOrder: 3,
      words: [
        { original: "Буьйса", translation: "ночь", position: 0 },
        { original: "дика", translation: "добрая", position: 1 },
        { original: "хьулда", translation: "пусть будет", position: 2 },
      ],
      examples: [],
    },
    {
      categoryId: catMap["Приветствия"],
      original: "Мухa ду хьо?",
      transliteration: "Muxa du xho?",
      translation: "Как ты? / Как дела?",
      lang: Language.CHE,
      sortOrder: 4,
      words: [
        { original: "Мухa", translation: "как", position: 0 },
        { original: "ду", translation: "есть", position: 1 },
        { original: "хьо", translation: "ты", position: 2 },
      ],
      examples: [
        {
          phrase: "— Мухa ду хьо?\n— Дика ду, баркалла!",
          translation: "— Как дела?\n— Хорошо, спасибо!",
          context: "Диалог при встрече",
        },
      ],
    },
    {
      categoryId: catMap["Приветствия"],
      original: "Везза хиира суна хьо ган!",
      transliteration: "Vezza xiira suna xho gan!",
      translation: "Рад тебя видеть!",
      lang: Language.CHE,
      sortOrder: 5,
      words: [
        { original: "Везза", translation: "рад", position: 0 },
        { original: "хиира", translation: "было", position: 1 },
        { original: "суна", translation: "мне", position: 2 },
        { original: "хьо", translation: "тебя", position: 3 },
        { original: "ган", translation: "видеть", position: 4 },
      ],
      examples: [],
    },
    {
      categoryId: catMap["Приветствия"],
      original: "Чоьхьа вола!",
      transliteration: "Chyokhha vola!",
      translation: "Заходи! / Войди! (к мужчине)",
      lang: Language.CHE,
      sortOrder: 6,
      words: [
        { original: "Чоьхьа", translation: "внутрь/войти", position: 0 },
        { original: "вола", translation: "зайди (м.р.)", position: 1 },
      ],
      examples: [
        {
          phrase: "Чоьхьа вола, стаг1а!",
          translation: "Заходи, гость!",
          context: "Приглашение войти",
        },
      ],
    },
    // Знакомство
    {
      categoryId: catMap["Знакомство"],
      original: "Со Алибек ву.",
      transliteration: "So Alibek vu.",
      translation: "Я Алибек. (о мужчине)",
      lang: Language.CHE,
      sortOrder: 0,
      words: [
        { original: "Со", translation: "я", position: 0 },
        { original: "Алибек", translation: "Алибек (имя)", position: 1 },
        { original: "ву", translation: "есть (м.р.)", position: 2 },
      ],
      examples: [],
    },
    {
      categoryId: catMap["Знакомство"],
      original: "Хьан цlе хlун ду?",
      transliteration: "Xhan ts'e xhun du?",
      translation: "Как тебя зовут?",
      lang: Language.CHE,
      sortOrder: 1,
      words: [
        { original: "Хьан", translation: "твоё", position: 0 },
        { original: "цlе", translation: "имя", position: 1 },
        { original: "хlун", translation: "что", position: 2 },
        { original: "ду", translation: "есть", position: 3 },
      ],
      examples: [
        {
          phrase: "— Хьан цlе хlун ду?\n— Сан цlе Хеда ю.",
          translation: "— Как тебя зовут?\n— Меня зовут Хеда.",
          context: "",
        },
      ],
    },
    {
      categoryId: catMap["Знакомство"],
      original: "Сtуна ченийн мотт хlaa лара.",
      transliteration: "Suna cheniy'n mott xhaa lara.",
      translation: "Я хочу выучить чеченский язык.",
      lang: Language.CHE,
      sortOrder: 2,
      words: [
        { original: "Сtуна", translation: "мне", position: 0 },
        { original: "ченийн", translation: "чеченский", position: 1 },
        { original: "мотт", translation: "язык", position: 2 },
        { original: "хlaa", translation: "знать/учить", position: 3 },
        { original: "лара", translation: "хочу", position: 4 },
      ],
      examples: [],
    },
    {
      categoryId: catMap["Знакомство"],
      original: "Со муьлхачу мехкара ву?",
      transliteration: "So m'ulxachu mexkara vu?",
      translation: "Из какой я страны? (спрашивают о тебе)",
      lang: Language.CHE,
      sortOrder: 3,
      words: [
        { original: "Сo", translation: "я", position: 0 },
        { original: "муьлхачу", translation: "из какой", position: 1 },
        { original: "мехкара", translation: "страны", position: 2 },
        { original: "ву", translation: "есть (м.р.)", position: 3 },
      ],
      examples: [],
    },
    // Благодарность
    {
      categoryId: catMap["Благодарность"],
      original: "Баркалла!",
      transliteration: "Barkalla!",
      translation: "Спасибо!",
      lang: Language.CHE,
      sortOrder: 0,
      words: [{ original: "Баркалла", translation: "спасибо", position: 0 }],
      examples: [
        {
          phrase: "Баркалла хьан дог1аниг1а!",
          translation: "Спасибо за твою помощь!",
          context: "",
        },
      ],
    },
    {
      categoryId: catMap["Благодарность"],
      original: "Дика хьулда хьуна!",
      transliteration: "Dika xhulda xhuna!",
      translation: "Будь добр! / Всего хорошего! (ответ на «спасибо»)",
      lang: Language.CHE,
      sortOrder: 1,
      words: [
        { original: "Дика", translation: "хорошо", position: 0 },
        { original: "хьулда", translation: "пусть будет", position: 1 },
        { original: "хьуна", translation: "тебе", position: 2 },
      ],
      examples: [],
    },
    {
      categoryId: catMap["Благодарность"],
      original: "Со вевзина хьуна баркалла.",
      transliteration: "So vevzina xhuna barkalla.",
      translation: "Спасибо, что познакомился со мной.",
      lang: Language.CHE,
      sortOrder: 2,
      words: [
        { original: "Со", translation: "я", position: 0 },
        { original: "вевзина", translation: "познакомился", position: 1 },
        { original: "хьуна", translation: "тебе", position: 2 },
        { original: "баркалла", translation: "спасибо", position: 3 },
      ],
      examples: [],
    },
    // Вопросы
    {
      categoryId: catMap["Вопросы"],
      original: "Хlун аьлла хьо?",
      transliteration: "Xh'un aella xho?",
      translation: "Что ты сказал?",
      lang: Language.CHE,
      sortOrder: 0,
      words: [
        { original: "Хlун", translation: "что", position: 0 },
        { original: "аьлла", translation: "сказал", position: 1 },
        { original: "хьо", translation: "ты", position: 2 },
      ],
      examples: [],
    },
    {
      categoryId: catMap["Вопросы"],
      original: "И дош мухa хоу ченена?",
      transliteration: "I dosh muxa xhou chechena?",
      translation: "Как это слово по-чеченски?",
      lang: Language.CHE,
      sortOrder: 1,
      words: [
        { original: "И", translation: "это", position: 0 },
        { original: "дош", translation: "слово", position: 1 },
        { original: "мухa", translation: "как", position: 2 },
        { original: "хоу", translation: "говорят", position: 3 },
        { original: "ченена", translation: "по-чеченски", position: 4 },
      ],
      examples: [],
    },
    {
      categoryId: catMap["Вопросы"],
      original: "Хьо мичахь ву?",
      transliteration: "Xho michaxh vu?",
      translation: "Где ты? (о мужчине)",
      lang: Language.CHE,
      sortOrder: 2,
      words: [
        { original: "Хьо", translation: "ты", position: 0 },
        { original: "мичахь", translation: "где", position: 1 },
        { original: "ву", translation: "есть (м.р.)", position: 2 },
      ],
      examples: [],
    },
    {
      categoryId: catMap["Вопросы"],
      original: "Мила ву иза?",
      transliteration: "Mila vu iza?",
      translation: "Кто это? (о мужчине)",
      lang: Language.CHE,
      sortOrder: 3,
      words: [
        { original: "Мила", translation: "кто", position: 0 },
        { original: "ву", translation: "есть (м.р.)", position: 1 },
        { original: "иза", translation: "это/он", position: 2 },
      ],
      examples: [],
    },
    // Числа и время
    {
      categoryId: catMap["Числа и время"],
      original: "Цхьаъ, шиъ, кхоъ",
      transliteration: "Ts'xa', shi', kxo'",
      translation: "Один, два, три",
      lang: Language.CHE,
      sortOrder: 0,
      words: [
        { original: "Цхьаъ", translation: "один", position: 0 },
        { original: "шиъ", translation: "два", position: 1 },
        { original: "кхоъ", translation: "три", position: 2 },
      ],
      examples: [],
    },
    {
      categoryId: catMap["Числа и время"],
      original: "Стаг, пхиъ, ялх",
      transliteration: "Stag, pxi', yalx",
      translation: "Четыре, пять, шесть",
      lang: Language.CHE,
      sortOrder: 1,
      words: [
        { original: "Стаг", translation: "четыре", position: 0 },
        { original: "пхиъ", translation: "пять", position: 1 },
        { original: "ялх", translation: "шесть", position: 2 },
      ],
      examples: [],
    },
    {
      categoryId: catMap["Числа и время"],
      original: "Хlокху де мухa хан ю?",
      transliteration: "Xhokhu de muxa xan yu?",
      translation: "Который сейчас час?",
      lang: Language.CHE,
      sortOrder: 2,
      words: [
        { original: "Хlокху", translation: "сейчас", position: 0 },
        { original: "де", translation: "день/сейчас", position: 1 },
        { original: "мухa", translation: "какой", position: 2 },
        { original: "хан", translation: "час/время", position: 3 },
        { original: "ю", translation: "есть (ж.р.)", position: 4 },
      ],
      examples: [],
    },
    // Направления
    {
      categoryId: catMap["Направления"],
      original: "Муьлхачу агlор ю...?",
      transliteration: "M'ulxachu ag'or yu...?",
      translation: "В какой стороне...?",
      lang: Language.CHE,
      sortOrder: 0,
      words: [
        { original: "Муьлхачу", translation: "какой", position: 0 },
        { original: "агlор", translation: "стороне", position: 1 },
        { original: "ю", translation: "есть", position: 2 },
      ],
      examples: [
        {
          phrase: "Муьлхачу агlор ю базар?",
          translation: "В какой стороне рынок?",
          context: "",
        },
      ],
    },
    {
      categoryId: catMap["Направления"],
      original: "Аьтту агlор / Araг agIор",
      transliteration: "Aettu ag'or / Arag ag'or",
      translation: "Направо / Налево",
      lang: Language.CHE,
      sortOrder: 1,
      words: [
        { original: "Аьтту", translation: "правый", position: 0 },
        { original: "агlор", translation: "сторона", position: 1 },
      ],
      examples: [],
    },
    // Еда и напитки
    {
      categoryId: catMap["Еда и напитки"],
      original: "Хlума яа лаьа суна.",
      transliteration: "Xhuma yaa laea suna.",
      translation: "Я хочу есть.",
      lang: Language.CHE,
      sortOrder: 0,
      words: [
        { original: "Хlума", translation: "что-то/еда", position: 0 },
        { original: "яа", translation: "есть (кушать)", position: 1 },
        { original: "лаьа", translation: "хочу", position: 2 },
        { original: "суна", translation: "мне", position: 3 },
      ],
      examples: [],
    },
    {
      categoryId: catMap["Еда и напитки"],
      original: "Хи мала лаьa суна.",
      transliteration: "Xi mala laea suna.",
      translation: "Я хочу пить воду.",
      lang: Language.CHE,
      sortOrder: 1,
      words: [
        { original: "Хи", translation: "вода", position: 0 },
        { original: "мала", translation: "пить", position: 1 },
        { original: "лаьa", translation: "хочу", position: 2 },
        { original: "суна", translation: "мне", position: 3 },
      ],
      examples: [],
    },
    {
      categoryId: catMap["Еда и напитки"],
      original: "Дика яьли!",
      transliteration: "Dika yaeli!",
      translation: "Вкусно! (о еде)",
      lang: Language.CHE,
      sortOrder: 2,
      words: [
        { original: "Дика", translation: "хорошо/вкусно", position: 0 },
        { original: "яьли", translation: "получилось", position: 1 },
      ],
      examples: [],
    },
    // Эмоции
    {
      categoryId: catMap["Эмоции"],
      original: "Везза ву со.",
      transliteration: "Vezza vu so.",
      translation: "Я рад. (о мужчине)",
      lang: Language.CHE,
      sortOrder: 0,
      words: [
        { original: "Везза", translation: "рад", position: 0 },
        { original: "ву", translation: "есть (м.р.)", position: 1 },
        { original: "со", translation: "я", position: 2 },
      ],
      examples: [],
    },
    {
      categoryId: catMap["Эмоции"],
      original: "Са цlе ца хета суна.",
      transliteration: "Sa ts'e tsa xheta suna.",
      translation: "Мне грустно. / Мне плохо.",
      lang: Language.CHE,
      sortOrder: 1,
      words: [
        { original: "Са", translation: "моё", position: 0 },
        { original: "цlе", translation: "сердце/душа", position: 1 },
        { original: "ца", translation: "не", position: 2 },
        { original: "хета", translation: "чувствует", position: 3 },
        { original: "суна", translation: "мне", position: 4 },
      ],
      examples: [],
    },
    {
      categoryId: catMap["Эмоции"],
      original: "Дика хета суна!",
      transliteration: "Dika xheta suna!",
      translation: "Мне хорошо! / Я чувствую себя хорошо!",
      lang: Language.CHE,
      sortOrder: 2,
      words: [
        { original: "Дика", translation: "хорошо", position: 0 },
        { original: "хета", translation: "чувствую", position: 1 },
        { original: "суна", translation: "мне", position: 2 },
      ],
      examples: [],
    },
  ];

  let phraseCount = 0;
  for (const p of phrasesData) {
    await prisma.phrasebookPhrase.create({
      data: {
        categoryId: p.categoryId,
        original: p.original,
        transliteration: p.transliteration,
        translation: p.translation,
        lang: p.lang,
        sortOrder: p.sortOrder,
        words: { create: p.words },
        examples: { create: p.examples },
      },
    });
    phraseCount++;
  }

  console.log(
    `✅  Phrasebook seed: создано категорий — ${categories.length}, фраз — ${phraseCount}`,
  );
};
