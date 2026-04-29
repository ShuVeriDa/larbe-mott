import { ForbiddenException, Injectable } from "@nestjs/common";
import { PlanType, RoleName, SubscriptionStatus } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { UpdateGoalsDto } from "./dto/update-goals.dto";
import { UpdateNotificationsDto } from "./dto/update-notifications.dto";
import { UpdatePreferencesDto } from "./dto/update-preferences.dto";

const PRIVILEGED_ROLES: RoleName[] = [RoleName.ADMIN, RoleName.SUPERADMIN];

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
    // Premium-фича: включение деков заучивания требует активной Premium-подписки.
    // Дублируем минимальную логику PremiumGuard (без redis-кеша) — гард не подходит,
    // т.к. срабатывает на эндпоинт целиком, а нам нужно ограничить только одно поле.
    if (dto.enableDecks === true) {
      await this.assertPremium(userId);
    }

    return this.prisma.userPreferences.upsert({
      where: { userId },
      update: dto,
      create: { userId, ...dto },
    });
  }

  private async assertPremium(userId: string): Promise<void> {
    const [adminRole, latestPremiumSubscription] = await Promise.all([
      this.prisma.userRoleAssignment.findFirst({
        where: { userId, role: { name: { in: PRIVILEGED_ROLES } } },
      }),
      this.prisma.subscription.findFirst({
        where: { userId, plan: { type: PlanType.PREMIUM } },
        orderBy: { startDate: "desc" },
        select: { status: true },
      }),
    ]);

    if (adminRole) return;
    if (
      latestPremiumSubscription?.status === SubscriptionStatus.ACTIVE ||
      latestPremiumSubscription?.status === SubscriptionStatus.TRIALING
    ) {
      return;
    }

    if (
      latestPremiumSubscription?.status === SubscriptionStatus.CANCELED ||
      latestPremiumSubscription?.status === SubscriptionStatus.EXPIRED
    ) {
      throw new ForbiddenException({
        error: "SUBSCRIPTION_EXPIRED",
        message:
          "Your Premium subscription has expired. Renew to enable the learning decks.",
      });
    }

    throw new ForbiddenException({
      error: "SUBSCRIPTION_REQUIRED",
      message: "Enabling learning decks requires a Premium subscription.",
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
    // Транзакция: сначала записи (FK на folder со SetNull), потом папки.
    await this.prisma.$transaction([
      this.prisma.userDictionaryEntry.deleteMany({ where: { userId } }),
      this.prisma.userDictionaryFolder.deleteMany({ where: { userId } }),
    ]);
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
        folder: { select: { name: true } },
      },
      orderBy: { addedAt: "asc" },
    });

    // Сглаживаем `folder.name` → `folder` для удобного формата JSON / CSV
    const flat = entries.map(({ folder, ...rest }) => ({
      ...rest,
      folder: folder?.name ?? null,
    }));

    if (format === "csv") {
      const header =
        "word,normalized,translation,folder,learningLevel,cefrLevel,repetitionCount,addedAt";
      const rows = flat.map((e) =>
        [
          this.csvCell(e.word),
          this.csvCell(e.normalized ?? ""),
          this.csvCell(e.translation),
          this.csvCell(e.folder ?? ""),
          e.learningLevel,
          e.cefrLevel ?? "",
          e.repetitionCount,
          e.addedAt.toISOString(),
        ].join(","),
      );
      return [header, ...rows].join("\n");
    }

    return flat;
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
