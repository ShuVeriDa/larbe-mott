import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";

const EF_DEFAULT = 2.5;
const EF_MIN = 1.3;
const KNOWN_INTERVAL = 21; // дней до автоматического перевода в KNOWN

@Injectable()
export class WordProgressService {
  constructor(private prisma: PrismaService) {}

  // SM-2: возвращает новые значения после ответа качества quality (0-5)
  private applySM2(
    repetitions: number,
    easeFactor: number,
    interval: number,
    quality: number,
  ) {
    let newRep = repetitions;
    let newEF = easeFactor;
    let newInterval = interval;

    if (quality >= 3) {
      if (newRep === 0) newInterval = 1;
      else if (newRep === 1) newInterval = 6;
      else newInterval = Math.round(newInterval * newEF);
      newRep++;
      newEF = Math.max(
        EF_MIN,
        newEF + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02),
      );
    } else {
      newRep = 0;
      newInterval = 1;
      newEF = Math.max(EF_MIN, newEF - 0.2);
    }

    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + newInterval);

    return { repetitions: newRep, easeFactor: newEF, interval: newInterval, nextReview };
  }

  // Применяет эффект частоты: чем больше уникальных текстов, тем короче интервал
  private applyFrequencyEffect(interval: number, uniqueTextsCount: number): number {
    if (uniqueTextsCount >= 3) return Math.max(1, Math.round(interval * 0.8));
    if (uniqueTextsCount >= 2) return Math.max(1, Math.round(interval * 0.9));
    return interval;
  }

  // Вызывается при клике на слово (первое знакомство / активный просмотр)
  async registerClick(userId: string, lemmaId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await this.prisma.userWordProgress.upsert({
      where: { userId_lemmaId: { userId, lemmaId } },
      update: {
        lastSeen: new Date(),
        status: "LEARNING",
      },
      create: {
        userId,
        lemmaId,
        status: "LEARNING",
        lastSeen: new Date(),
        nextReview: today,
        easeFactor: EF_DEFAULT,
        interval: 0,
        repetitions: 0,
      },
    });
  }

  // Вызывается при открытии текста — пассивная встреча со словами
  async registerSeenWords(userId: string, lemmaIds: string[]) {
    const unique = [...new Set(lemmaIds)];
    const now = new Date();

    await this.prisma.userWordProgress.createMany({
      data: unique.map((lemmaId) => ({
        userId,
        lemmaId,
        lastSeen: now,
        easeFactor: EF_DEFAULT,
        interval: 0,
      })),
      skipDuplicates: true,
    });

    await this.prisma.userWordProgress.updateMany({
      where: { userId, lemmaId: { in: unique } },
      data: { lastSeen: now, seenCount: { increment: 1 } },
    });
  }

  // Обрабатывает результат повторения слова (quality 0-5)
  async submitReview(userId: string, lemmaId: string, quality: number) {
    const progress = await this.prisma.userWordProgress.findUnique({
      where: { userId_lemmaId: { userId, lemmaId } },
    });

    const current = progress ?? {
      repetitions: 0,
      easeFactor: EF_DEFAULT,
      interval: 0,
    };

    let { repetitions, easeFactor, interval, nextReview } = this.applySM2(
      current.repetitions,
      current.easeFactor,
      current.interval,
      quality,
    );

    // Эффект частоты: смотрим сколько уникальных текстов для этого слова
    const uniqueTextsCount = await this.prisma.wordContext.count({
      where: { userId, lemmaId },
    });
    interval = this.applyFrequencyEffect(interval, uniqueTextsCount);
    nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + interval);

    const newStatus =
      quality < 3
        ? "LEARNING"
        : interval >= KNOWN_INTERVAL
          ? "KNOWN"
          : "LEARNING";

    return this.prisma.userWordProgress.upsert({
      where: { userId_lemmaId: { userId, lemmaId } },
      update: { repetitions, easeFactor, interval, nextReview, status: newStatus, lastSeen: new Date() },
      create: {
        userId,
        lemmaId,
        repetitions,
        easeFactor,
        interval,
        nextReview,
        status: newStatus,
        lastSeen: new Date(),
      },
    });
  }

  // Возвращает слова, запланированные к повторению сегодня
  async getDueWords(userId: string, limit = 20) {
    const now = new Date();

    return this.prisma.userWordProgress.findMany({
      where: {
        userId,
        status: { not: "KNOWN" },
        OR: [{ nextReview: null }, { nextReview: { lte: now } }],
      },
      orderBy: [{ nextReview: "asc" }, { seenCount: "desc" }],
      take: limit,
      include: {
        lemma: {
          select: {
            id: true,
            baseForm: true,
            partOfSpeech: true,
            headwords: {
              take: 1,
              include: { entry: { select: { rawTranslate: true } } },
            },
          },
        },
      },
    });
  }

  // Сохраняет контекст встречи слова (fire-and-forget — не await)
  async saveContext(
    userId: string,
    lemmaId: string,
    textId: string,
    word: string,
    tokenId?: string,
  ) {
    let snippet: string | undefined;

    if (tokenId) {
      try {
        const token = await this.prisma.textToken.findUnique({
          where: { id: tokenId },
          select: { pageId: true, position: true },
        });

        if (token?.pageId) {
          const neighbors = await this.prisma.textToken.findMany({
            where: {
              pageId: token.pageId,
              position: { gte: token.position - 6, lte: token.position + 6 },
            },
            orderBy: { position: "asc" },
            select: { original: true },
          });
          snippet = neighbors.map((t) => t.original).join(" ").trim();
        }
      } catch {
        // контекст необязателен — игнорируем ошибки
      }
    }

    try {
      await this.prisma.wordContext.createMany({
        data: [{ userId, lemmaId, textId, word, snippet }],
        skipDuplicates: true,
      });
    } catch {
      // игнорируем ошибки дедупликации
    }
  }

  // Ручная установка статуса слова (NEW / LEARNING / KNOWN) из ридера
  async setWordStatus(userId: string, lemmaId: string, status: "NEW" | "LEARNING" | "KNOWN") {
    const now = new Date();

    if (status === "NEW") {
      // Сброс SM-2: слово возвращается в начало очереди
      return this.prisma.userWordProgress.upsert({
        where: { userId_lemmaId: { userId, lemmaId } },
        update: {
          status: "NEW",
          repetitions: 0,
          interval: 0,
          easeFactor: EF_DEFAULT,
          nextReview: null,
          lastSeen: now,
        },
        create: {
          userId,
          lemmaId,
          status: "NEW",
          repetitions: 0,
          interval: 0,
          easeFactor: EF_DEFAULT,
          nextReview: null,
          lastSeen: now,
        },
      });
    }

    if (status === "LEARNING") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      // Попадает в очередь повторения сегодня
      return this.prisma.userWordProgress.upsert({
        where: { userId_lemmaId: { userId, lemmaId } },
        update: {
          status: "LEARNING",
          nextReview: today,
          lastSeen: now,
        },
        create: {
          userId,
          lemmaId,
          status: "LEARNING",
          repetitions: 0,
          interval: 0,
          easeFactor: EF_DEFAULT,
          nextReview: today,
          lastSeen: now,
        },
      });
    }

    // KNOWN: интервал 21 день, выбывает из очереди повторений
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + KNOWN_INTERVAL);

    return this.prisma.userWordProgress.upsert({
      where: { userId_lemmaId: { userId, lemmaId } },
      update: {
        status: "KNOWN",
        interval: KNOWN_INTERVAL,
        nextReview,
        lastSeen: now,
      },
      create: {
        userId,
        lemmaId,
        status: "KNOWN",
        repetitions: 0,
        interval: KNOWN_INTERVAL,
        easeFactor: EF_DEFAULT,
        nextReview,
        lastSeen: now,
      },
    });
  }

  // Возвращает все контексты для слова пользователя
  async getWordContexts(userId: string, lemmaId: string) {
    return this.prisma.wordContext.findMany({
      where: { userId, lemmaId },
      orderBy: { seenAt: "desc" },
      select: {
        id: true,
        word: true,
        snippet: true,
        seenAt: true,
        text: { select: { id: true, title: true, language: true } },
      },
    });
  }
}
