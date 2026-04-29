import { Inject, Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import type { Logger as WinstonLogger } from "winston";

import { AuthService } from "./auth.service";

@Injectable()
export class PasswordResetCleanupTask {
  constructor(
    private readonly auth: AuthService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: WinstonLogger,
  ) {}

  // Раз в сутки в 03:00 выкидываем мусор: записи где expiresAt|usedAt старше 7 дней.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanup() {
    try {
      const removed = await this.auth.cleanupExpiredPasswordResetTokens();
      if (removed > 0) {
        this.logger.info("[password-reset] cleanup removed stale tokens", {
          removed,
        });
      }
    } catch (e) {
      this.logger.error("[password-reset] cleanup failed", {
        message: (e as Error).message,
      });
    }
  }
}
