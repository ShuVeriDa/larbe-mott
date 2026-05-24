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
   *
   * Dirty-check: when the row already exists and the stored progressPercent
   * is within 0.01 % of the new value, we skip writing progressPercent
   * (saves a write on every page turn when no new words were encountered).
   * `lastOpened` is still updated if `touchLastOpened` is set, so the
   * "continue reading" list always reflects the real last-seen timestamp.
   */
  async persistProgress(
    userId: string,
    textId: string,
    progressPercent: number,
    opts: { touchLastOpened?: boolean } = {},
  ): Promise<void> {
    const now = new Date();

    const existing = await this.prisma.userTextProgress.findUnique({
      where: { userId_textId: { userId, textId } },
      select: { progressPercent: true, completedAt: true },
    });

    const progressChanged =
      !existing || Math.abs((existing.progressPercent ?? 0) - progressPercent) > 0.01;
    const needsCompletionStamp = progressPercent >= 100 && !existing?.completedAt;

    if (!existing) {
      await this.prisma.userTextProgress.create({
        data: {
          userId,
          textId,
          progressPercent,
          ...(opts.touchLastOpened ? { lastOpened: now } : {}),
          ...(needsCompletionStamp ? { completedAt: now } : {}),
        },
      });
      return;
    }

    // Build update payload only with what actually changed
    const updateData: Record<string, unknown> = {};
    if (progressChanged) updateData.progressPercent = progressPercent;
    if (opts.touchLastOpened) updateData.lastOpened = now;
    if (needsCompletionStamp) updateData.completedAt = now;

    if (Object.keys(updateData).length === 0) return; // nothing to write

    await this.prisma.userTextProgress.update({
      where: { userId_textId: { userId, textId } },
      data: updateData,
    });
  }

  /**
   * Updates the user's reading position. Bumps lastPageNumber forward only
   * (never moves it backwards on revisits) and refreshes lastOpened.
   * Validates that pageNumber is within [1, totalPages].
   *
   * Pass `knownTotalPages` when the caller already has it (e.g. getPage which
   * just fetched/cached it) to avoid a redundant COUNT query.
   */
  async setPosition(
    userId: string,
    textId: string,
    pageNumber: number,
    knownTotalPages?: number,
  ): Promise<{ lastPageNumber: number; totalPages: number }> {
    const totalPages =
      knownTotalPages ?? (await this.prisma.textPage.count({ where: { textId } }));
    if (totalPages === 0) {
      throw new NotFoundException("Text has no pages");
    }
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > totalPages) {
      throw new BadRequestException(
        `pageNumber must be an integer in [1, ${totalPages}]`,
      );
    }

    const now = new Date();

    // Single UPSERT with a conditional lastPageNumber update:
    // - on insert: use pageNumber as the initial position
    // - on conflict: advance only if the new page is further ahead
    // This replaces the previous SELECT + UPSERT two-round-trip pattern.
    await this.prisma.$executeRaw`
      INSERT INTO "UserTextProgress" ("userId", "textId", "lastPageNumber", "lastOpened")
      VALUES (${userId}, ${textId}, ${pageNumber}, ${now})
      ON CONFLICT ("userId", "textId") DO UPDATE
        SET "lastPageNumber" = GREATEST("UserTextProgress"."lastPageNumber", EXCLUDED."lastPageNumber"),
            "lastOpened"     = EXCLUDED."lastOpened"
    `;

    const updated = await this.prisma.userTextProgress.findUnique({
      where: { userId_textId: { userId, textId } },
      select: { lastPageNumber: true },
    });

    return { lastPageNumber: updated?.lastPageNumber ?? pageNumber, totalPages };
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

    // Single query: count total unique lemmas and known unique lemmas for this
    // text version in one DB round-trip, avoiding the previous findMany that
    // pulled the entire TokenAnalysis table into Node.js memory.
    const [row] = await this.prisma.$queryRaw<[{ total: bigint; known: bigint }]>`
      SELECT
        COUNT(DISTINCT ta."lemmaId")                                                       AS total,
        COUNT(DISTINCT CASE WHEN uwp.status = 'KNOWN' THEN ta."lemmaId" END)              AS known
      FROM   "TokenAnalysis"       ta
      JOIN   "TextToken"           tt  ON tt.id        = ta."tokenId"
                                      AND tt."versionId" = ${latestVersion.id}
      LEFT JOIN "UserWordProgress" uwp ON uwp."lemmaId" = ta."lemmaId"
                                      AND uwp."userId"   = ${userId}
      WHERE  ta."isPrimary" = true
        AND  ta."lemmaId"  IS NOT NULL
    `;

    const total = Number(row.total);
    const known = Number(row.known);
    const result = total === 0 ? 0 : (known / total) * 100;

    void this.redis.set(cacheKey, result.toString(), "EX", PROGRESS_CACHE_TTL_S);
    return result;
  }

  async invalidateProgressCache(userId: string, textId: string): Promise<void> {
    await this.redis.del(progressCacheKey(userId, textId));
  }
}
