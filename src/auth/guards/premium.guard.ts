import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { PlanType, RoleName, SubscriptionStatus, User as UserPrisma } from "@prisma/client";
import { ErrorCode } from "src/common/errors/error-codes";
import { PrismaService } from "src/prisma.service";
import { RedisService } from "src/redis/redis.service";

const PRIVILEGED_ROLES = new Set([RoleName.ADMIN, RoleName.SUPERADMIN]);
const PREMIUM_CACHE_TTL_SECONDS = 300;
const PREMIUM_CACHE_PREFIX = "premium";
type CachedPremiumState = "active" | "expired" | "none";

@Injectable()
export class PremiumGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(_context: ExecutionContext): Promise<boolean> {
    // All features are free — premium gate disabled.
    // To re-enable: remove the line below and restore the commented block.
    return true;

    // ── Restore block below to re-enable premium gating ──────────────────────
    // const request = context
    //   .switchToHttp()
    //   .getRequest<{ user?: UserPrisma }>();
    // const userId = request.user?.id;
    //
    // if (!userId) {
    //   throw new ForbiddenException({ code: ErrorCode.ACCESS_DENIED, message: "Access denied" });
    // }
    //
    // const cached = await this.getCachedState(userId);
    // if (cached === "active") return true;
    // if (cached === "expired") {
    //   throw new ForbiddenException({
    //     code: ErrorCode.SUBSCRIPTION_EXPIRED,
    //     message:
    //       "Your Premium subscription has expired. Your data is preserved — renew to continue.",
    //   });
    // }
    // if (cached === "none") {
    //   throw new ForbiddenException({
    //     code: ErrorCode.SUBSCRIPTION_REQUIRED,
    //     message: "This feature requires a Premium subscription.",
    //   });
    // }
    //
    // const [adminRole, latestPremiumSubscription] = await Promise.all([
    //   this.prisma.userRoleAssignment.findFirst({
    //     where: { userId, role: { name: { in: [...PRIVILEGED_ROLES] } } },
    //   }),
    //   this.prisma.subscription.findFirst({
    //     where: {
    //       userId,
    //       plan: { type: PlanType.PREMIUM },
    //     },
    //     orderBy: { startDate: "desc" },
    //     select: { status: true },
    //   }),
    // ]);
    //
    // if (
    //   adminRole ||
    //   latestPremiumSubscription?.status === SubscriptionStatus.ACTIVE ||
    //   latestPremiumSubscription?.status === SubscriptionStatus.TRIALING
    // ) {
    //   await this.setCachedState(userId, "active");
    //   return true;
    // }
    //
    // if (
    //   latestPremiumSubscription?.status === SubscriptionStatus.CANCELED ||
    //   latestPremiumSubscription?.status === SubscriptionStatus.EXPIRED
    // ) {
    //   await this.setCachedState(userId, "expired");
    //   throw new ForbiddenException({
    //     code: ErrorCode.SUBSCRIPTION_EXPIRED,
    //     message:
    //       "Your Premium subscription has expired. Your data is preserved — renew to continue.",
    //   });
    // }
    //
    // await this.setCachedState(userId, "none");
    // throw new ForbiddenException({
    //   code: ErrorCode.SUBSCRIPTION_REQUIRED,
    //   message: "This feature requires a Premium subscription.",
    // });
    // ─────────────────────────────────────────────────────────────────────────
  }

  private cacheKey(userId: string): string {
    return `${PREMIUM_CACHE_PREFIX}:${userId}`;
  }

  private async getCachedState(userId: string): Promise<CachedPremiumState | null> {
    try {
      const value = await this.redis.get(this.cacheKey(userId));
      if (value === "active" || value === "expired" || value === "none") {
        return value;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async setCachedState(userId: string, state: CachedPremiumState): Promise<void> {
    try {
      await this.redis.set(
        this.cacheKey(userId),
        state,
        "EX",
        PREMIUM_CACHE_TTL_SECONDS,
      );
    } catch {
      // Ignore cache errors; guard should still work with DB fallback.
    }
  }
}
