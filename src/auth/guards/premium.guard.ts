import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { PlanType, SubscriptionStatus, User as UserPrisma } from "@prisma/client";
import { PrismaService } from "src/prisma.service";

@Injectable()
export class PremiumGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: UserPrisma }>();
    const userId = request.user?.id;

    if (!userId) {
      throw new ForbiddenException("Access denied");
    }

    const activeSubscription = await this.prisma.subscription.findFirst({
      where: {
        userId,
        plan: { type: PlanType.PREMIUM },
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
      },
    });

    if (activeSubscription) {
      return true;
    }

    const expiredSubscription = await this.prisma.subscription.findFirst({
      where: {
        userId,
        plan: { type: PlanType.PREMIUM },
        status: { in: [SubscriptionStatus.CANCELED, SubscriptionStatus.EXPIRED] },
      },
    });

    if (expiredSubscription) {
      throw new ForbiddenException({
        error: "SUBSCRIPTION_EXPIRED",
        message:
          "Your Premium subscription has expired. Your data is preserved — renew to continue.",
      });
    }

    throw new ForbiddenException({
      error: "SUBSCRIPTION_REQUIRED",
      message: "This feature requires a Premium subscription.",
    });
  }
}
