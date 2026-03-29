import { Injectable } from "@nestjs/common";
import { FeatureFlagEnvironment } from "@prisma/client";
import { PrismaService } from "src/prisma.service";

@Injectable()
export class FeatureFlagsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Checks if a feature flag is enabled for a given user.
   * Priority: per-user override -> global value with env + rollout.
   */
  async isFeatureEnabled(userId: string, key: string): Promise<boolean> {
    const override = await this.prisma.userFeatureFlag.findFirst({
      where: {
        userId,
        featureFlag: { key, deletedAt: null },
      },
      select: { isEnabled: true },
    });
    if (override) return override.isEnabled;

    const flag = await this.prisma.featureFlag.findUnique({
      where: { key },
      select: { isEnabled: true, rolloutPercent: true, environments: true, deletedAt: true },
    });
    if (!flag || flag.deletedAt) return false;

    const env = this.resolveEnvironment();
    if (!flag.environments.includes(env)) return false;
    if (!flag.isEnabled) return false;
    if (flag.rolloutPercent >= 100) return true;
    if (flag.rolloutPercent <= 0) return false;

    const bucket = this.stablePercentBucket(userId, key);
    return bucket < flag.rolloutPercent;
  }

  private resolveEnvironment(): FeatureFlagEnvironment {
    const explicit = (process.env["APP_ENV"] ?? process.env["NODE_ENV"] ?? "")
      .toLowerCase()
      .trim();
    if (explicit === "production" || explicit === "prod") return FeatureFlagEnvironment.PROD;
    if (explicit === "staging" || explicit === "stage") return FeatureFlagEnvironment.STAGE;
    return FeatureFlagEnvironment.DEV;
  }

  private stablePercentBucket(userId: string, key: string): number {
    const source = `${userId}:${key}`;
    let hash = 0;
    for (let i = 0; i < source.length; i += 1) {
      hash = (hash * 31 + source.charCodeAt(i)) % 2_147_483_647;
    }
    return Math.abs(hash) % 100;
  }
}

