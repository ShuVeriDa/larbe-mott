import { Inject, Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import type { Logger as WinstonLogger } from "winston";

import { AuthService } from "./auth.service";

@Injectable()
export class EmailChangeCleanupTask {
  constructor(
    private readonly auth: AuthService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: WinstonLogger,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanup() {
    try {
      const removed = await this.auth.cleanupExpiredEmailChangeTokens();
      if (removed > 0) {
        this.logger.info("[email-change] cleanup removed stale tokens", {
          removed,
        });
      }
    } catch (e) {
      this.logger.error("[email-change] cleanup failed", {
        message: (e as Error).message,
      });
    }
  }
}
