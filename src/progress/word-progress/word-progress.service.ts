import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { attachLatestContexts } from "../latest-context.helper";

const EF_DEFAULT = 2.5;
const EF_MIN = 1.3;
const KNOWN_INTERVAL = 21; // дней до автоматического перевода в KNOWN

@Injectable()
export class WordProgressService {
  private readonly logger = new Logger(WordProgressService.name);

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
    nextReview.setUTCDate(nextReview.getUTCDate() + newInterval);

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
    today.setUTCHours(0, 0, 0, 0);

    await this.prisma.$transaction(async (tx) => {
      await tx.userWordProgress.upsert({
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
    });
    await this.syncTextProgressForLemma(userId, lemmaId);
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
    const intervalBefore = current.interval;

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
    nextReview.setUTCDate(nextReview.getUTCDate() + interval);

    const newStatus =
      quality < 3
        ? "LEARNING"
        : interval >= KNOWN_INTERVAL
          ? "KNOWN"
          : "LEARNING";

    const [result] = await this.prisma.$transaction([
      this.prisma.userWordProgress.upsert({
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
      }),
      this.prisma.userReviewLog.create({
        data: {
          userId,
          lemmaId,
          quality,
          correct: quality >= 3,
          intervalBefore,
          intervalAfter: interval,
        },
      }),
      // Зеркалим SM-2 статус в UserDictionaryEntry, чтобы карточка словаря не расходилась
      this.prisma.userDictionaryEntry.updateMany({
        where: { userId, lemmaId },
        data: { learningLevel: newStatus, repetitionCount: repetitions },
      }),
    ]);

    await this.syncTextProgressForLemma(userId, lemmaId);
    return result;
  }

  // Возвращает слова, запланированные к повторению сегодня.
  // К каждой карточке подмешивается последний WordContext (snippet + sourceTitle).
  async getDueWords(userId: string, limit = 20) {
    const now = new Date();

    const rows = await this.prisma.userWordProgress.findMany({
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
              take: 3,
              orderBy: { order: "asc" },
              include: { entry: { select: { rawTranslate: true } } },
            },
            morphForms: {
              take: 8,
              orderBy: [{ gramCase: "asc" }, { gramNumber: "asc" }],
              select: { form: true, grammarTag: true, gramCase: true, gramNumber: true },
            },
          },
        },
      },
    });

    return attachLatestContexts(this.prisma, userId, rows);
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
      } catch (error) {
        // Контекст не критичен для бизнес-потока, но ошибка полезна для диагностики.
        this.logger.debug(
          `Failed to build context snippet for lemma ${lemmaId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    try {
      await this.prisma.wordContext.createMany({
        data: [{ userId, lemmaId, textId, word, snippet }],
        skipDuplicates: true,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist word context for lemma ${lemmaId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // Ручная установка статуса слова (NEW / LEARNING / KNOWN) из ридера
  async setWordStatus(userId: string, lemmaId: string, status: "NEW" | "LEARNING" | "KNOWN") {
    const now = new Date();

    if (status === "NEW") {
      const [result] = await this.prisma.$transaction([
        this.prisma.userWordProgress.upsert({
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
        }),
        this.prisma.userDictionaryEntry.updateMany({
          where: { userId, lemmaId },
          data: { learningLevel: "NEW", repetitionCount: 0 },
        }),
      ]);
      await this.syncTextProgressForLemma(userId, lemmaId);
      return result;
    }

    if (status === "LEARNING") {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const [result] = await this.prisma.$transaction([
        this.prisma.userWordProgress.upsert({
          where: { userId_lemmaId: { userId, lemmaId } },
          update: {
            status: "LEARNING",
            repetitions: 0,
            interval: 0,
            easeFactor: EF_DEFAULT,
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
        }),
        this.prisma.userDictionaryEntry.updateMany({
          where: { userId, lemmaId },
          data: { learningLevel: "LEARNING", repetitionCount: 0 },
        }),
      ]);
      await this.syncTextProgressForLemma(userId, lemmaId);
      return result;
    }

    // KNOWN: интервал 21 день, выбывает из очереди повторений
    const nextReview = new Date();
    nextReview.setUTCDate(nextReview.getUTCDate() + KNOWN_INTERVAL);

    const [result] = await this.prisma.$transaction([
      this.prisma.userWordProgress.upsert({
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
      }),
      this.prisma.userDictionaryEntry.updateMany({
        where: { userId, lemmaId },
        data: { learningLevel: "KNOWN" },
      }),
    ]);
    await this.syncTextProgressForLemma(userId, lemmaId);
    return result;
  }

  // Возвращает контексты для слова пользователя (с пагинацией и фильтром по уровню)
  async getWordContexts(
    userId: string,
    lemmaId: string,
    opts: { page?: string | number; limit?: string | number; level?: string } = {},
  ) {
    const pageNum = Math.max(1, Number.parseInt(String(opts.page ?? 1), 10) || 1);
    const limitNum = Math.min(
      100,
      Math.max(1, Number.parseInt(String(opts.limit ?? 20), 10) || 20),
    );
    const allowedLevels = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
    const level = allowedLevels.includes(opts.level as (typeof allowedLevels)[number])
      ? (opts.level as (typeof allowedLevels)[number])
      : undefined;

    const where = {
      userId,
      lemmaId,
      ...(level ? { text: { level } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.wordContext.findMany({
        where,
        orderBy: { seenAt: "desc" },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        select: {
          id: true,
          word: true,
          snippet: true,
          seenAt: true,
          text: { select: { id: true, title: true, language: true, level: true } },
        },
      }),
      this.prisma.wordContext.count({ where }),
    ]);

    return { items, total, page: pageNum, limit: limitNum };
  }

  // Возвращает календарь повторений за последние N дней + следующее запланированное.
  // Каждый день: "done" (был лог за день), "today" (сегодня),
  // "next" (на этот день стоит nextReview), "empty" (ничего).
  async getWordCalendar(userId: string, lemmaId: string, days: number) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - (days - 1));

    const [logs, progress] = await Promise.all([
      this.prisma.userReviewLog.findMany({
        where: { userId, lemmaId, createdAt: { gte: start } },
        select: { createdAt: true, correct: true },
      }),
      this.prisma.userWordProgress.findUnique({
        where: { userId_lemmaId: { userId, lemmaId } },
        select: { nextReview: true },
      }),
    ]);

    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const doneDays = new Map<string, boolean>(); // key -> any correct?
    for (const log of logs) {
      const key = dayKey(new Date(Date.UTC(
        log.createdAt.getUTCFullYear(),
        log.createdAt.getUTCMonth(),
        log.createdAt.getUTCDate(),
      )));
      doneDays.set(key, (doneDays.get(key) ?? false) || log.correct);
    }
    const todayKey = dayKey(today);
    const nextReviewKey = progress?.nextReview ? dayKey(new Date(Date.UTC(
      progress.nextReview.getUTCFullYear(),
      progress.nextReview.getUTCMonth(),
      progress.nextReview.getUTCDate(),
    ))) : null;

    const result: { date: string; status: "done" | "empty" | "today" | "next" }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      const key = dayKey(d);
      let status: "done" | "empty" | "today" | "next" = "empty";
      if (doneDays.has(key)) status = "done";
      else if (key === todayKey) status = "today";
      else if (key === nextReviewKey) status = "next";
      result.push({ date: key, status });
    }
    return result;
  }

  private async syncTextProgressForLemma(userId: string, lemmaId: string): Promise<void> {
    const lemmaTokens = await this.prisma.tokenAnalysis.findMany({
      where: { lemmaId, isPrimary: true },
      select: { token: { select: { version: { select: { textId: true } } } } },
    });
    const touchedTextIds = [
      ...new Set(
        lemmaTokens
          .map((row) => row.token.version.textId)
          .filter((textId): textId is string => Boolean(textId)),
      ),
    ];
    if (!touchedTextIds.length) return;

    const trackedRows = await this.prisma.userTextProgress.findMany({
      where: { userId, textId: { in: touchedTextIds } },
      select: { textId: true },
    });
    if (!trackedRows.length) return;

    const trackedTextIds = trackedRows.map((r) => r.textId);
    const versions = await this.prisma.textProcessingVersion.findMany({
      where: { textId: { in: trackedTextIds } },
      orderBy: { version: "desc" },
      select: { id: true, textId: true },
    });
    const latestVersionByTextId = new Map<string, string>();
    for (const v of versions) {
      if (!latestVersionByTextId.has(v.textId)) latestVersionByTextId.set(v.textId, v.id);
    }

    const versionIds = [...latestVersionByTextId.values()];
    const analyses = versionIds.length
      ? await this.prisma.tokenAnalysis.findMany({
          where: {
            isPrimary: true,
            lemmaId: { not: null },
            token: { versionId: { in: versionIds } },
          },
          select: { lemmaId: true, token: { select: { versionId: true } } },
        })
      : [];

    const lemmaIdsByVersion = new Map<string, Set<string>>();
    for (const row of analyses) {
      if (!row.lemmaId) continue;
      if (!lemmaIdsByVersion.has(row.token.versionId)) {
        lemmaIdsByVersion.set(row.token.versionId, new Set());
      }
      lemmaIdsByVersion.get(row.token.versionId)!.add(row.lemmaId);
    }

    const allLemmaIds = [
      ...new Set(
        analyses
          .map((row) => row.lemmaId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const knownRows = allLemmaIds.length
      ? await this.prisma.userWordProgress.findMany({
          where: { userId, status: "KNOWN", lemmaId: { in: allLemmaIds } },
          select: { lemmaId: true },
        })
      : [];
    const knownLemmaIds = new Set(knownRows.map((row) => row.lemmaId));

    const completedTextIds: string[] = [];
    const updates = trackedTextIds.map((textId) => {
      const versionId = latestVersionByTextId.get(textId);
      const lemmaSet = versionId ? (lemmaIdsByVersion.get(versionId) ?? new Set<string>()) : new Set<string>();
      const total = lemmaSet.size;
      const known = [...lemmaSet].filter((id) => knownLemmaIds.has(id)).length;
      const progressPercent = total === 0 ? 0 : (known / total) * 100;

      if (progressPercent >= 100) completedTextIds.push(textId);

      return this.prisma.userTextProgress.update({
        where: { userId_textId: { userId, textId } },
        data: { progressPercent },
      });
    });

    await this.prisma.$transaction(updates);

    if (completedTextIds.length) {
      await this.prisma.userTextProgress.updateMany({
        where: { userId, textId: { in: completedTextIds }, completedAt: null },
        data: { completedAt: new Date() },
      });
    }
  }
}
