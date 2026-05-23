import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { RedisService } from "src/redis/redis.service";

const PROGRESS_CACHE_TTL_S = 300; // 5 minutes
const progressCacheKey = (userId: string, textId: string) =>
  `progress:${userId}:${textId}`;

@Injectable()
export class TextProgressService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  /**
   * Persists `progressPercent` for a (user, text) and stamps `completedAt`
   * the first time progress reaches 100%. Optionally bumps `lastOpened`.
   * Stamping is conditional on `completedAt IS NULL` so re-reads don't
   * overwrite the original completion timestamp used by statistics.
   */
  async persistProgress(
    userId: string,
    textId: string,
    progressPercent: number,
    opts: { touchLastOpened?: boolean } = {},
  ): Promise<void> {
    const now = new Date();
    const data = {
      progressPercent,
      ...(opts.touchLastOpened ? { lastOpened: now } : {}),
    };
    await this.prisma.userTextProgress.upsert({
      where: { userId_textId: { userId, textId } },
      update: data,
      create: { userId, textId, ...data },
    });
    if (progressPercent >= 100) {
      await this.prisma.userTextProgress.updateMany({
        where: { userId, textId, completedAt: null },
        data: { completedAt: now },
      });
    }
  }

  /**
   * Updates the user's reading position. Bumps lastPageNumber forward only
   * (never moves it backwards on revisits) and refreshes lastOpened.
   * Validates that pageNumber is within [1, totalPages].
   */
  async setPosition(
    userId: string,
    textId: string,
    pageNumber: number,
  ): Promise<{ lastPageNumber: number; totalPages: number }> {
    const totalPages = await this.prisma.textPage.count({ where: { textId } });
    if (totalPages === 0) {
      throw new NotFoundException("Text has no pages");
    }
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > totalPages) {
      throw new BadRequestException(
        `pageNumber must be an integer in [1, ${totalPages}]`,
      );
    }

    const now = new Date();
    const existing = await this.prisma.userTextProgress.findUnique({
      where: { userId_textId: { userId, textId } },
      select: { lastPageNumber: true },
    });

    const nextPage = Math.max(existing?.lastPageNumber ?? 1, pageNumber);

    await this.prisma.userTextProgress.upsert({
      where: { userId_textId: { userId, textId } },
      update: { lastPageNumber: nextPage, lastOpened: now },
      create: {
        userId,
        textId,
        lastPageNumber: nextPage,
        lastOpened: now,
      },
    });

    return { lastPageNumber: nextPage, totalPages };
  }

  async calculateProgress(userId: string, textId: string) {
    const cacheKey = progressCacheKey(userId, textId);
    const cached = await this.redis.get(cacheKey);
    if (cached !== null) return parseFloat(cached);

    const latestVersion = await this.prisma.textProcessingVersion.findFirst({
      where: { textId, isCurrent: true },
      select: { id: true },
    });
    if (!latestVersion) return 0;

    const primaryAnalyses = await this.prisma.tokenAnalysis.findMany({
      where: {
        isPrimary: true,
        lemmaId: { not: null },
        token: { versionId: latestVersion.id },
      },
      select: { lemmaId: true },
    });
    const lemmaIds = new Set(
      primaryAnalyses
        .map((analysis) => analysis.lemmaId)
        .filter((lemmaId): lemmaId is string => lemmaId !== null),
    );

    const total = lemmaIds.size;

    const known = await this.prisma.userWordProgress.count({
      where: {
        userId,
        lemmaId: { in: [...lemmaIds] },
        status: "KNOWN",
      },
    });

    const result = total === 0 ? 0 : (known / total) * 100;
    await this.redis.set(cacheKey, result.toString(), "EX", PROGRESS_CACHE_TTL_S);
    return result;
  }

  async invalidateProgressCache(userId: string, textId: string): Promise<void> {
    await this.redis.del(progressCacheKey(userId, textId));
  }
}
