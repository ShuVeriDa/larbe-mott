import { Injectable } from "@nestjs/common";
import { SubscriptionStatus } from "@prisma/client";
import { PrismaService } from "src/prisma.service";

@Injectable()
export class SubscriptionService {
  constructor(private readonly prisma: PrismaService) {}

  async getActivePlans() {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priceCents: "asc" },
    });
  }

  async getMySubscription(userId: string) {
    return this.prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
      },
      include: { plan: true },
      orderBy: { startDate: "desc" },
    });
  }
}
