import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PaymentProvider, PaymentStatus, PlanType, SubscriptionStatus, UserEventType } from "@prisma/client";
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

  async getMyPayments(userId: string) {
    return this.prisma.payment.findMany({
      where: { userId },
      include: {
        subscription: { include: { plan: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getUsage(userId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [translationsToday, wordsInDictionary, subscription] = await Promise.all([
      this.prisma.userEvent.count({
        where: { userId, type: UserEventType.CLICK_WORD, createdAt: { gte: todayStart } },
      }),
      this.prisma.userDictionaryEntry.count({ where: { userId } }),
      this.getMySubscription(userId),
    ]);

    const planLimits = subscription?.plan?.limits as Record<string, number> | null;
    const limits = {
      maxTranslationsPerDay: planLimits?.maxTranslationsPerDay ?? 50,
      maxVocabularyWords: planLimits?.maxVocabularyWords ?? 500,
    };

    return { translationsToday, wordsInDictionary, limits };
  }

  async subscribeToPlan(userId: string, planId: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) throw new NotFoundException("Plan not found or inactive");

    // Пункт 2: подписка на FREE через этот эндпоинт запрещена
    if (plan.type === PlanType.FREE) {
      throw new BadRequestException("Use DELETE /subscription to downgrade to free");
    }

    // Пункт 1: уже подписан на этот план
    const current = await this.getMySubscription(userId);
    if (current?.planId === planId) {
      throw new ConflictException("Already subscribed to this plan");
    }

    // Пункт 3: понижение плана — сохраняем текущий endDate
    const isDowngrade =
      current?.plan != null && plan.priceCents < current.plan.priceCents;

    return this.prisma.$transaction(async (tx) => {
      if (current) {
        await tx.subscription.update({
          where: { id: current.id },
          data: { status: SubscriptionStatus.CANCELED, canceledAt: new Date() },
        });
      }

      const now = new Date();
      let endDate: Date | null = null;

      if (isDowngrade && current?.endDate) {
        // При понижении сохраняем оставшийся оплаченный период
        endDate = current.endDate;
      } else if (plan.interval === "month") {
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
      } else if (plan.interval === "year") {
        endDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
      }

      const subscription = await tx.subscription.create({
        data: {
          userId,
          planId,
          status: SubscriptionStatus.ACTIVE,
          startDate: now,
          endDate,
          provider: PaymentProvider.MANUAL,
        },
        include: { plan: true },
      });

      // Пункт 4: запись платежа (только при апгрейде — при даунгрейде деньги не списываются)
      if (!isDowngrade) {
        await tx.payment.create({
          data: {
            userId,
            subscriptionId: subscription.id,
            provider: PaymentProvider.MANUAL,
            status: PaymentStatus.SUCCEEDED,
            amountCents: plan.priceCents,
            currency: plan.currency,
          },
        });
      }

      return subscription;
    });
  }

  async cancelSubscription(userId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
      },
      orderBy: { startDate: "desc" },
    });

    if (!subscription) throw new NotFoundException("No active subscription found");

    return this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: SubscriptionStatus.CANCELED, canceledAt: new Date() },
      include: { plan: true },
    });
  }

  async redeemCoupon(userId: string, code: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { code } });

    if (!coupon || !coupon.isActive)
      throw new NotFoundException("Promo code not found or inactive");

    const now = new Date();
    if (coupon.validFrom && coupon.validFrom > now)
      throw new BadRequestException("Promo code is not yet valid");
    if (coupon.validUntil && coupon.validUntil < now)
      throw new BadRequestException("Promo code has expired");
    if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions)
      throw new BadRequestException("Promo code redemption limit reached");

    const existing = await this.prisma.couponRedemption.findFirst({
      where: { couponId: coupon.id, userId },
    });
    if (existing) throw new ConflictException("Promo code already redeemed");

    return this.prisma.$transaction(async (tx) => {
      await tx.coupon.update({
        where: { id: coupon.id },
        data: { redeemedCount: { increment: 1 } },
      });
      await tx.couponRedemption.create({
        data: { couponId: coupon.id, userId },
      });
      return { type: coupon.type, amount: coupon.amount };
    });
  }
}
