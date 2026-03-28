import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { UpdateGoalsDto } from "./dto/update-goals.dto";
import { UpdateNotificationsDto } from "./dto/update-notifications.dto";
import { UpdatePreferencesDto } from "./dto/update-preferences.dto";

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── GET ALL ─────────────────────────────────────────────────────────────────

  async getAll(userId: string) {
    const [preferences, goals, notifications] = await Promise.all([
      this.getOrCreatePreferences(userId),
      this.getOrCreateGoals(userId),
      this.getOrCreateNotifications(userId),
    ]);

    return { preferences, goals, notifications };
  }

  // ─── PREFERENCES ─────────────────────────────────────────────────────────────

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    return this.prisma.userPreferences.upsert({
      where: { userId },
      update: dto,
      create: { userId, ...dto },
    });
  }

  // ─── GOALS ───────────────────────────────────────────────────────────────────

  async updateGoals(userId: string, dto: UpdateGoalsDto) {
    return this.prisma.userGoals.upsert({
      where: { userId },
      update: dto,
      create: { userId, ...dto },
    });
  }

  // ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

  async updateNotifications(userId: string, dto: UpdateNotificationsDto) {
    return this.prisma.userNotificationPreferences.upsert({
      where: { userId },
      update: dto,
      create: { userId, ...dto },
    });
  }

  // ─── RESET ───────────────────────────────────────────────────────────────────

  async resetReadingProgress(userId: string) {
    await this.prisma.userTextProgress.deleteMany({ where: { userId } });
    return { success: true };
  }

  async clearVocabulary(userId: string) {
    await this.prisma.userDictionaryEntry.deleteMany({ where: { userId } });
    return { success: true };
  }

  // ─── EXPORT ──────────────────────────────────────────────────────────────────

  async exportVocabulary(userId: string, format: "json" | "csv" = "json") {
    const entries = await this.prisma.userDictionaryEntry.findMany({
      where: { userId },
      select: {
        word: true,
        normalized: true,
        translation: true,
        learningLevel: true,
        cefrLevel: true,
        repetitionCount: true,
        addedAt: true,
      },
      orderBy: { addedAt: "asc" },
    });

    if (format === "csv") {
      const header = "word,normalized,translation,learningLevel,cefrLevel,repetitionCount,addedAt";
      const rows = entries.map((e) =>
        [
          this.csvCell(e.word),
          this.csvCell(e.normalized ?? ""),
          this.csvCell(e.translation),
          e.learningLevel,
          e.cefrLevel ?? "",
          e.repetitionCount,
          e.addedAt.toISOString(),
        ].join(","),
      );
      return [header, ...rows].join("\n");
    }

    return entries;
  }

  async exportArchive(userId: string) {
    const [vocabulary, textProgress, wordProgress, reviewLogs] = await Promise.all([
      this.exportVocabulary(userId),
      this.prisma.userTextProgress.findMany({
        where: { userId },
        select: { textId: true, progressPercent: true, lastOpened: true },
      }),
      this.prisma.userWordProgress.findMany({
        where: { userId },
        select: {
          lemmaId: true,
          status: true,
          seenCount: true,
          repetitions: true,
          easeFactor: true,
          interval: true,
          lastSeen: true,
          nextReview: true,
        },
      }),
      this.prisma.userReviewLog.findMany({
        where: { userId },
        select: { lemmaId: true, quality: true, correct: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return { vocabulary, textProgress, wordProgress, reviewLogs };
  }

  private csvCell(value: string): string {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  async exportProgress(userId: string) {
    const [textProgress, wordProgress, reviewLogs] = await Promise.all([
      this.prisma.userTextProgress.findMany({
        where: { userId },
        select: {
          textId: true,
          progressPercent: true,
          lastOpened: true,
        },
      }),
      this.prisma.userWordProgress.findMany({
        where: { userId },
        select: {
          lemmaId: true,
          status: true,
          seenCount: true,
          repetitions: true,
          easeFactor: true,
          interval: true,
          lastSeen: true,
          nextReview: true,
        },
      }),
      this.prisma.userReviewLog.findMany({
        where: { userId },
        select: {
          lemmaId: true,
          quality: true,
          correct: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return { textProgress, wordProgress, reviewLogs };
  }

  // ─── PRIVATE ─────────────────────────────────────────────────────────────────

  private getOrCreatePreferences(userId: string) {
    return this.prisma.userPreferences.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  private getOrCreateGoals(userId: string) {
    return this.prisma.userGoals.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  private getOrCreateNotifications(userId: string) {
    return this.prisma.userNotificationPreferences.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }
}
