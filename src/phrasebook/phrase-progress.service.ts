import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { ErrorCode } from "src/common/errors/error-codes";

const EF_DEFAULT = 2.5;
const EF_MIN = 1.3;
const KNOWN_INTERVAL = 21;

@Injectable()
export class PhraseProgressService {
  constructor(private readonly prisma: PrismaService) {}

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

    return { repetitions: newRep, easeFactor: newEF, interval: newInterval };
  }

  private nextReviewDate(intervalDays: number, timezone: string): Date {
    try {
      const now = new Date();
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(now);
      const y = Number(parts.find((p) => p.type === "year")!.value);
      const m = Number(parts.find((p) => p.type === "month")!.value) - 1;
      const d = Number(parts.find((p) => p.type === "day")!.value);

      const local = new Date(y, m, d + intervalDays);
      const pad = (n: number) => String(n).padStart(2, "0");
      const dateStr = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;

      const naiveUtc = new Date(`${dateStr}T00:00:00Z`);
      const shifted = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(naiveUtc);
      const shiftedMs = new Date(shifted.replace(", ", "T") + "Z").getTime();
      const offsetMs = naiveUtc.getTime() - shiftedMs;
      return new Date(naiveUtc.getTime() + offsetMs);
    } catch {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + intervalDays);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    }
  }

  async submitReview(userId: string, phraseId: string, quality: number) {
    const phrase = await this.prisma.phrasebookPhrase.findUnique({
      where: { id: phraseId },
      select: { id: true },
    });
    if (!phrase) {
      throw new NotFoundException({
        code: ErrorCode.PHRASE_NOT_FOUND,
        message: "Phrase not found",
      });
    }

    const [progress, notifPrefs] = await Promise.all([
      this.prisma.userPhrasebookProgress.findUnique({
        where: { userId_phraseId: { userId, phraseId } },
      }),
      this.prisma.userNotificationPreferences.findUnique({
        where: { userId },
        select: { timezone: true },
      }),
    ]);

    const timezone = notifPrefs?.timezone ?? "Europe/Moscow";
    const current = progress ?? {
      repetitions: 0,
      easeFactor: EF_DEFAULT,
      interval: 0,
    };
    const intervalBefore = current.interval;

    const { repetitions, easeFactor, interval } = this.applySM2(
      current.repetitions,
      current.easeFactor,
      current.interval,
      quality,
    );

    const nextReview = this.nextReviewDate(interval, timezone);
    const newStatus =
      quality < 3 ? "LEARNING" : interval >= KNOWN_INTERVAL ? "KNOWN" : "LEARNING";

    const [result] = await this.prisma.$transaction([
      this.prisma.userPhrasebookProgress.upsert({
        where: { userId_phraseId: { userId, phraseId } },
        update: {
          repetitions,
          easeFactor,
          interval,
          nextReview,
          status: newStatus,
          lastSeen: new Date(),
        },
        create: {
          userId,
          phraseId,
          repetitions,
          easeFactor,
          interval,
          nextReview,
          status: newStatus,
          lastSeen: new Date(),
        },
      }),
      this.prisma.userPhrasebookReviewLog.create({
        data: {
          userId,
          phraseId,
          quality,
          correct: quality >= 3,
          intervalBefore,
          intervalAfter: interval,
        },
      }),
    ]);

    return result;
  }

  async getDueReview(userId: string, categoryId?: string, savedOnly?: boolean) {
    const now = new Date();

    let phraseIds: string[] | undefined;

    if (savedOnly) {
      const saves = await this.prisma.userPhrasebookSave.findMany({
        where: { userId },
        select: { phraseId: true },
      });
      phraseIds = saves.map((s) => s.phraseId);
      if (!phraseIds.length) return [];
    }

    const phrases = await this.prisma.phrasebookPhrase.findMany({
      where: {
        ...(categoryId ? { categoryId } : {}),
        ...(phraseIds ? { id: { in: phraseIds } } : {}),
      },
      include: {
        words: { orderBy: { position: "asc" } },
        examples: true,
        saves: { where: { userId }, select: { id: true } },
        progress: { where: { userId }, select: { status: true, nextReview: true, interval: true, repetitions: true } },
      },
      orderBy: { sortOrder: "asc" },
    });

    // When filtering by category or saved: include all non-KNOWN phrases (ignore nextReview schedule).
    // For "all" mode: only include phrases that are due now or never started.
    const due = phrases.filter((p) => {
      const prog = p.progress[0];
      if (!prog) return true; // never started → always include
      if (prog.status === 'KNOWN') return false; // fully learned → skip
      if (categoryId || savedOnly) return true; // explicit scope → include all non-KNOWN
      // default "all" mode: respect SRS schedule
      return !prog.nextReview || prog.nextReview <= now;
    });

    return due.map((p) => {
      const prog = p.progress[0];
      return {
        id: p.id,
        categoryId: p.categoryId,
        original: p.original,
        transliteration: p.transliteration,
        translation: p.translation,
        lang: p.lang,
        audioUrl: p.audioUrl,
        saved: p.saves.length > 0,
        status: prog?.status ?? "NEW",
        interval: prog?.interval ?? 0,
        repetitions: prog?.repetitions ?? 0,
        nextReview: prog?.nextReview ?? null,
        words: p.words.map((w) => ({
          id: w.id,
          original: w.original,
          translation: w.translation,
          position: w.position,
        })),
        examples: p.examples.map((e) => ({
          id: e.id,
          phrase: e.phrase,
          translation: e.translation,
          context: e.context,
        })),
      };
    });
  }

  async getReviewStats(userId: string) {
    const now = new Date();

    const [dueProgress, learningCount, knownCount, todayLogs, totalPhrases, startedPhraseIds, savedIds] =
      await this.prisma.$transaction([
        // phrases in progress that are due (not KNOWN and due now)
        this.prisma.userPhrasebookProgress.count({
          where: {
            userId,
            status: { not: "KNOWN" },
            OR: [{ nextReview: null }, { nextReview: { lte: now } }],
          },
        }),
        this.prisma.userPhrasebookProgress.count({
          where: { userId, status: "LEARNING" },
        }),
        this.prisma.userPhrasebookProgress.count({
          where: { userId, status: "KNOWN" },
        }),
        this.prisma.userPhrasebookReviewLog.count({
          where: {
            userId,
            createdAt: { gte: new Date(new Date().setUTCHours(0, 0, 0, 0)) },
          },
        }),
        this.prisma.phrasebookPhrase.count({}),
        this.prisma.userPhrasebookProgress.findMany({
          where: { userId },
          select: { phraseId: true },
        }),
        this.prisma.userPhrasebookSave.findMany({
          where: { userId },
          select: { phraseId: true },
        }),
      ]);

    // NEW phrases (never started) are also due
    const startedIds = new Set(startedPhraseIds.map((p) => p.phraseId));
    const newCount = totalPhrases - startedIds.size;
    const dueCount = dueProgress + Math.max(0, newCount);

    // savedDueCount: saved phrases that are not KNOWN
    const savedPhraseIds = savedIds.map((s) => s.phraseId);
    const savedKnownCount = savedPhraseIds.length > 0
      ? await this.prisma.userPhrasebookProgress.count({
          where: { userId, phraseId: { in: savedPhraseIds }, status: "KNOWN" },
        })
      : 0;
    const savedDueCount = Math.max(0, savedPhraseIds.length - savedKnownCount);

    // Streak: count consecutive days with at least one review
    const streak = await this.calculateStreak(userId);

    return { dueCount, savedDueCount, learningCount, knownCount, reviewedToday: todayLogs, streak };
  }

  private async calculateStreak(userId: string): Promise<number> {
    const logs = await this.prisma.userPhrasebookReviewLog.findMany({
      where: { userId },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    if (!logs.length) return 0;

    const dayKey = (d: Date) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

    const activeDays = new Set(logs.map((l) => dayKey(l.createdAt)));
    const today = dayKey(new Date());

    let streak = 0;
    const cursor = new Date();
    cursor.setUTCHours(0, 0, 0, 0);

    // If didn't review today, check if yesterday was reviewed (streak still valid)
    if (!activeDays.has(today)) {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
      const yesterday = dayKey(cursor);
      if (!activeDays.has(yesterday)) return 0;
    }

    while (activeDays.has(dayKey(cursor))) {
      streak++;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }

    return streak;
  }

  async getCategoryProgress(userId: string) {
    const categories = await this.prisma.phrasebookCategory.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        _count: { select: { phrases: true } },
        phrases: {
          select: {
            id: true,
            progress: {
              where: { userId },
              select: { status: true },
            },
          },
        },
      },
    });

    return categories.map((c) => {
      const total = c._count.phrases;
      const known = c.phrases.filter(
        (p) => p.progress[0]?.status === "KNOWN",
      ).length;
      const learning = c.phrases.filter(
        (p) => p.progress[0]?.status === "LEARNING",
      ).length;

      return {
        id: c.id,
        emoji: c.emoji,
        name: c.name,
        sortOrder: c.sortOrder,
        phraseCount: total,
        knownCount: known,
        learningCount: learning,
        progressPercent: total === 0 ? 0 : Math.round((known / total) * 100),
      };
    });
  }
}
