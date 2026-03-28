import { PrismaPg } from "@prisma/adapter-pg";
import {
  FeedbackAuthorType,
  FeedbackContextType,
  FeedbackStatus,
  FeedbackType,
  PrismaClient,
  ReactionType,
} from "@prisma/client";
import "dotenv/config";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

export const seedFeedback = async () => {
  // Берём сеяных пользователей
  const [user1, user2, user3, admin] = await Promise.all([
    prisma.user.findUnique({ where: { email: "user1@example.com" }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: "user2@example.com" }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: "user3@example.com" }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: "tallar@tallar.du" }, select: { id: true } }),
  ]);

  if (!user1 || !user2 || !user3 || !admin) {
    console.warn("⚠️  Feedback seed: не найдены нужные пользователи. Сначала запустите основной seed.");
    return;
  }

  // Опционально: берём первые леммы и тексты для контекста
  const [lemmas, texts] = await Promise.all([
    prisma.lemma.findMany({ take: 3, select: { id: true, baseForm: true } }),
    prisma.text.findMany({ take: 2, select: { id: true, title: true } }),
  ]);

  const lemma1 = lemmas[0] ?? null;
  const lemma2 = lemmas[1] ?? null;
  const text1 = texts[0] ?? null;

  // ─── 1. Вопрос про слово (открыт, без ответа) ──────────────────────────────
  const thread1 = await prisma.feedbackThread.create({
    data: {
      userId: user1.id,
      type: FeedbackType.QUESTION,
      status: FeedbackStatus.NEW,
      contextType: FeedbackContextType.WORD,
      contextWord: lemma1?.baseForm ?? "хьалхара",
      contextSentence: "Со хьалхара вахара школе.",
      contextLemmaId: lemma1?.id,
      contextTextId: text1?.id,
      contextPosition: 1,
      contextAction: "translate",
      messages: {
        create: {
          authorType: FeedbackAuthorType.USER,
          authorId: user1.id,
          body: "Не понимаю перевод слова «хьалхара» в этом предложении. В словаре написано «первый», но по контексту не сходится.",
        },
      },
    },
  });

  // ─── 2. Баг в предложении (ответ получен) ──────────────────────────────────
  const thread2 = await prisma.feedbackThread.create({
    data: {
      userId: user2.id,
      type: FeedbackType.BUG,
      status: FeedbackStatus.ANSWERED,
      contextType: FeedbackContextType.SENTENCE,
      contextSentence: "Цуьнан цlе хаьа суна.",
      contextLemmaId: lemma2?.id,
      contextTextId: text1?.id,
      contextPosition: 5,
      contextAction: "parse",
      messages: {
        create: {
          authorType: FeedbackAuthorType.USER,
          authorId: user2.id,
          body: "Слово «цlе» размечается как глагол, но это явно существительное «имя». Морфология ломается на этом предложении.",
        },
      },
    },
  });

  // Ответ администратора
  await prisma.feedbackMessage.create({
    data: {
      threadId: thread2.id,
      authorType: FeedbackAuthorType.ADMIN,
      authorId: admin.id,
      body: "Спасибо, зафиксировали! Это известная проблема с омографами. Задача поставлена лингвисту — исправим в следующем обновлении морфологических правил.",
    },
  });

  // Уточнение от пользователя
  await prisma.feedbackMessage.create({
    data: {
      threadId: thread2.id,
      authorType: FeedbackAuthorType.USER,
      authorId: user2.id,
      body: "Понял, спасибо. Встречается ещё в тексте про семью — там похожая ситуация с «йо1».",
    },
  });

  // ─── 3. Идея (решена) ───────────────────────────────────────────────────────
  const thread3 = await prisma.feedbackThread.create({
    data: {
      userId: user3.id,
      type: FeedbackType.IDEA,
      status: FeedbackStatus.RESOLVED,
      messages: {
        create: {
          authorType: FeedbackAuthorType.USER,
          authorId: user3.id,
          body: "Было бы здорово добавить озвучку слов при нажатии — особенно для тех, кто только начинает и не знает произношения.",
        },
      },
    },
  });

  await prisma.feedbackMessage.create({
    data: {
      threadId: thread3.id,
      authorType: FeedbackAuthorType.ADMIN,
      authorId: admin.id,
      body: "Отличная идея! Уже в планах на Q3 — добавим аудио для базовой лексики. Спасибо за фидбек!",
    },
  });

  // ─── 4. Жалоба на текст (новая) ─────────────────────────────────────────────
  await prisma.feedbackThread.create({
    data: {
      userId: user1.id,
      type: FeedbackType.COMPLAINT,
      status: FeedbackStatus.NEW,
      contextType: FeedbackContextType.TEXT,
      contextTextId: text1?.id,
      contextAction: "read",
      messages: {
        create: {
          authorType: FeedbackAuthorType.USER,
          authorId: user1.id,
          body: "В тексте «Нохчийн мотт» несколько слов вообще не переведены и отмечены как неизвестные, хотя они очень базовые (напр. «сан», «хьо»). Уровень A1 — но текст явно сложнее.",
        },
      },
    },
  });

  // ─── 5. Вопрос без контекста (новый) ───────────────────────────────────────
  await prisma.feedbackThread.create({
    data: {
      userId: user2.id,
      type: FeedbackType.QUESTION,
      status: FeedbackStatus.NEW,
      messages: {
        create: {
          authorType: FeedbackAuthorType.USER,
          authorId: user2.id,
          body: "Как сбросить прогресс по тексту? Хочу перечитать с нуля, но кнопки не нашёл.",
        },
      },
    },
  });

  // ─── 6. Жалоба (в обработке, взята в работу) ────────────────────────────────
  const thread6 = await prisma.feedbackThread.create({
    data: {
      userId: user3.id,
      type: FeedbackType.COMPLAINT,
      status: FeedbackStatus.IN_PROGRESS,
      contextType: FeedbackContextType.TEXT,
      contextTextId: text1?.id,
      contextAction: "read",
      messages: {
        create: {
          authorType: FeedbackAuthorType.USER,
          authorId: user3.id,
          body: "Приложение зависает при переходе между страницами текста на Android. Приходится перезапускать.",
        },
      },
    },
  });

  await prisma.feedbackMessage.create({
    data: {
      threadId: thread6.id,
      authorType: FeedbackAuthorType.ADMIN,
      authorId: admin.id,
      body: "Получили ваш отчёт. Воспроизвели на эмуляторе Android 12 — разбираемся. Уточните, пожалуйста, версию приложения.",
    },
  });

  // ─── 6. Быстрые реакции ─────────────────────────────────────────────────────
  const reactionData: Array<{
    userId: string;
    type: ReactionType;
    lemmaId?: string;
    textId?: string;
  }> = [];

  if (lemma1) {
    reactionData.push(
      { userId: user1.id, type: ReactionType.HELPFUL,     lemmaId: lemma1.id },
      { userId: user2.id, type: ReactionType.HELPFUL,     lemmaId: lemma1.id },
      { userId: user3.id, type: ReactionType.DIFFICULT,   lemmaId: lemma1.id },
    );
  }
  if (lemma2) {
    reactionData.push(
      { userId: user1.id, type: ReactionType.NOT_HELPFUL, lemmaId: lemma2.id },
      { userId: user3.id, type: ReactionType.DIFFICULT,   lemmaId: lemma2.id },
    );
  }
  if (text1) {
    reactionData.push(
      { userId: user1.id, type: ReactionType.DIFFICULT,   textId: text1.id },
      { userId: user2.id, type: ReactionType.NOT_HELPFUL, textId: text1.id },
    );
  }

  if (reactionData.length > 0) {
    await prisma.feedbackReaction.createMany({
      data: reactionData,
      skipDuplicates: true,
    });
  }

  console.log("✅  Feedback seed: создано тредов — 6, сообщений — 9, реакций —", reactionData.length);
};
