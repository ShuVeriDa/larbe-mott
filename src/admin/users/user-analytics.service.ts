import { Injectable } from "@nestjs/common";
import {
  Level,
  Prisma,
  UserEvent,
  UserEventType,
  WordStatus,
} from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { LevelProgressItemDto } from "./dto/level-progress-item.dto";
import { UserLearningStatsDto } from "./dto/user-learning-stats.dto";

@Injectable()
export class UserAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserLearningStats(userId: string): Promise<UserLearningStatsDto> {
    const [textsRead, wordsKnown, wordsLearning, levelProgressRaw, events] =
      await Promise.all([
        this.prisma.userTextProgress.count({
          where: { userId, progressPercent: { gt: 0 } },
        }),
        this.prisma.userWordProgress.count({
          where: { userId, status: WordStatus.KNOWN },
        }),
        this.prisma.userWordProgress.count({
          where: { userId, status: WordStatus.LEARNING },
        }),
        this.prisma.userTextProgress.findMany({
          where: { userId, progressPercent: { gt: 0 } },
          select: {
            text: {
              select: {
                level: true,
              },
            },
          },
        }),
        this.prisma.userEvent.findMany({
          where: {
            userId,
            type: {
              in: [
                UserEventType.START_SESSION,
                UserEventType.OPEN_TEXT,
                UserEventType.CLICK_WORD,
                UserEventType.ADD_TO_DICTIONARY,
              ],
            },
          } as Prisma.UserEventWhereInput,
          orderBy: { createdAt: "asc" },
        }),
      ]);

    const levelProgress = this.buildLevelProgress(levelProgressRaw);
    const streakDays = this.calculateStreak(events);
    const totalStudyMinutes = this.calculateTotalStudyTime(events);

    return {
      textsRead,
      wordsKnown,
      wordsLearning,
      streakDays,
      totalStudyMinutes,
      levelProgress,
    };
  }

  private buildLevelProgress(
    progress: { text: { level: Level | null } }[],
  ): LevelProgressItemDto[] {
    const map = new Map<Level, number>();

    for (const item of progress) {
      const level = item.text.level;
      if (!level) {
        continue;
      }
      map.set(level, (map.get(level) ?? 0) + 1);
    }

    return Array.from(map.entries()).map(([level, textsCount]) => ({
      level,
      textsCount,
    }));
  }

  private calculateStreak(events: Pick<UserEvent, "createdAt">[]): number {
    if (!events.length) {
      return 0;
    }

    // Считаем дни с активностью
    const days = new Set<string>();
    for (const event of events) {
      const d = event.createdAt;
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
      days.add(key);
    }

    const sortedDays = Array.from(days)
      .map((key) => {
        const [year, month, day] = key.split("-").map((v) => Number(v));
        return new Date(Date.UTC(year, month, day));
      })
      .sort((a, b) => a.getTime() - b.getTime());

    let streak = 1;
    let currentStreak = 1;

    for (let i = sortedDays.length - 2; i >= 0; i--) {
      const current = sortedDays[i];
      const next = sortedDays[i + 1];
      const diffDays = Math.round(
        (next.getTime() - current.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (diffDays === 1) {
        currentStreak += 1;
        streak = Math.max(streak, currentStreak);
      } else if (diffDays > 1) {
        break;
      }
    }

    return streak;
  }

  private calculateTotalStudyTime(
    events: Pick<UserEvent, "createdAt">[],
  ): number {
    if (events.length < 2) {
      return 0;
    }

    let totalMs = 0;

    for (let i = 0; i < events.length - 1; i++) {
      const current = events[i];
      const next = events[i + 1];

      const diffMs = next.createdAt.getTime() - current.createdAt.getTime();
      // Считаем только интервалы до 30 минут как непрерывную сессию
      const thirtyMinutesMs = 30 * 60 * 1000;
      if (diffMs > 0 && diffMs <= thirtyMinutesMs) {
        totalMs += diffMs;
      }
    }

    const totalMinutes = Math.round(totalMs / (1000 * 60));
    return totalMinutes;
  }
}

