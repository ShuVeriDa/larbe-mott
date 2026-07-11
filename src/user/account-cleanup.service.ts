import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { UserStatus } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { ACCOUNT_DELETION_GRACE_PERIOD_DAYS as GRACE_PERIOD_DAYS } from "./account-cleanup.constants";

/**
 * Фоновый job, который безвозвратно удаляет аккаунты, помеченные status=DELETED
 * больше {GRACE_PERIOD_DAYS} дней назад. Соответствует обещанию из дизайна
 * settings.html: "Аккаунт деактивируется. Данные сохранятся 30 дней, затем удалятся".
 *
 * Все связанные таблицы зачищаются Prisma cascade-связями (см. schema.prisma:
 * onDelete: Cascade на UserSession, UserPreferences, UserDictionary*, etc.).
 */
@Injectable()
export class AccountCleanupService {
  private readonly logger = new Logger(AccountCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: "purge-deleted-accounts" })
  async purgeDeletedAccounts() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - GRACE_PERIOD_DAYS);

    const candidates = await this.prisma.user.findMany({
      where: {
        status: UserStatus.DELETED,
        deletedAt: { lte: cutoff, not: null },
      },
      select: { id: true, email: true, deletedAt: true },
    });

    if (candidates.length === 0) {
      return;
    }

    this.logger.log(
      `Purging ${candidates.length} account(s) past ${GRACE_PERIOD_DAYS}-day grace period`,
    );

    for (const user of candidates) {
      try {
        await this.prisma.user.delete({ where: { id: user.id } });
        this.logger.log(
          `Hard-deleted user ${user.id} (deleted at ${user.deletedAt?.toISOString()})`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to hard-delete user ${user.id}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
  }
}
