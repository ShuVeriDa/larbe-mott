import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";

@Injectable()
export class FeatureFlagsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Checks if a feature flag is enabled for a given user.
   * Priority: per-user override -> global flag value.
   */
  async isFeatureEnabled(userId: string, key: string): Promise<boolean> {
    const override = await this.prisma.userFeatureFlag.findFirst({
      where: {
        userId,
        featureFlag: { key },
      },
      select: { isEnabled: true },
    });
    if (override) return override.isEnabled;

    const flag = await this.prisma.featureFlag.findUnique({
      where: { key },
      select: { isEnabled: true },
    });
    return flag?.isEnabled ?? false;
  }
}

