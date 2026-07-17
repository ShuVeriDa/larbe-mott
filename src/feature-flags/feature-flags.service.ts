import { Injectable } from "@nestjs/common";
import { FeatureFlagEnvironment } from "@prisma/client";
import { PrismaService } from "src/prisma.service";

// Studied-content languages gated behind admin-granted per-user flags.
// Keyed by the lowercase codes used across content-language DTOs (e.g.
// ai-translation's SourceLanguage). Kept in sync by hand with text.service.ts's
// GATED_LANGUAGE_FLAGS, which uses Prisma's uppercase Language enum instead —
// the two can't share one map because they key on different casings/types.
const GATED_CONTENT_LANGUAGE_FLAGS: Partial<Record<string, string>> = {
  ar: "functional.arabic_language",
  en: "functional.english_language",
};

@Injectable()
export class FeatureFlagsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Checks if a user may access a gated studied-content language (e.g. "ar",
   * "en" in ai-translation's SourceLanguage). Languages absent from
   * GATED_CONTENT_LANGUAGE_FLAGS (e.g. "che") are ungated and always allowed.
   */
  async canAccessContentLanguage(userId: string | undefined, language: string): Promise<boolean> {
    const flagKey = GATED_CONTENT_LANGUAGE_FLAGS[language];
    if (!flagKey) return true;
    if (!userId) return false;
    return this.isFeatureEnabled(userId, flagKey);
  }

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

