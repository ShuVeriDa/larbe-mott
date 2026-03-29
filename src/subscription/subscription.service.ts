import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CouponType,
  PaymentProvider,
  PaymentStatus,
  PlanType,
  Prisma,
  SubscriptionEventType,
  SubscriptionStatus,
  UserEventType,
} from "@prisma/client";
import { PrismaService } from "src/prisma.service";

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getActivePlans() {
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priceCents: "asc" },
    });

    // Group plans that share a groupCode (e.g. monthly + yearly variants of the same tier)
    const grouped: Record<string, typeof plans> = {};
    const ungrouped: typeof plans = [];

    for (const plan of plans) {
      if (plan.groupCode) {
        if (!grouped[plan.groupCode]) grouped[plan.groupCode] = [];
        grouped[plan.groupCode].push(plan);
      } else {
        ungrouped.push(plan);
      }
    }

    const groups = Object.entries(grouped).map(([groupCode, variants]) => ({
      groupCode,
      variants,
    }));

    return { groups, ungrouped };
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
    this.assertBillingModeSafeForCurrentEnv();
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
    const isUpgrade =
      current?.plan != null && plan.priceCents > current.plan.priceCents;

    return this.prisma.$transaction(async (tx) => {
      if (current) {
        await tx.subscription.update({
          where: { id: current.id },
          data: { status: SubscriptionStatus.CANCELED, canceledAt: new Date() },
        });
        await tx.subscriptionEvent.create({
          data: {
            subscriptionId: current.id,
            type: SubscriptionEventType.CANCELED,
            metadata: { reason: "plan_change", toPlanCode: plan.code },
          },
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
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          type: isDowngrade
            ? SubscriptionEventType.DOWNGRADED
            : isUpgrade
              ? SubscriptionEventType.UPGRADED
              : SubscriptionEventType.SUBSCRIBED,
          metadata: {
            fromPlanCode: current?.plan?.code ?? null,
            toPlanCode: plan.code,
          },
        },
      });

      // Запись платежа (только при апгрейде — при даунгрейде деньги не списываются)
      let couponApplied:
        | {
            code: string;
            type: CouponType;
            amount: number;
            discountCents: number;
          }
        | null = null;

      if (!isDowngrade) {
        // Ищем неиспользованное погашение купона для этого пользователя
        const pendingRedemption = await tx.couponRedemption.findFirst({
          where: { userId, paymentId: null },
          include: { coupon: true },
          orderBy: { redeemedAt: "desc" },
        });

        let amountCents = plan.priceCents;

        if (pendingRedemption) {
          const { coupon } = pendingRedemption;

          // Проверяем, применим ли купон к выбранному плану
          const planApplicable =
            coupon.applicablePlans.length === 0 ||
            coupon.applicablePlans.includes(plan.code);

          if (planApplicable) {
            const beforeDiscount = amountCents;
            if (coupon.type === CouponType.PERCENT) {
              amountCents = Math.max(0, Math.round(amountCents * (1 - coupon.amount / 100)));
            } else {
              // FIXED — скидка в центах
              amountCents = Math.max(0, amountCents - coupon.amount);
            }
            couponApplied = {
              code: coupon.code,
              type: coupon.type,
              amount: coupon.amount,
              discountCents: Math.max(0, beforeDiscount - amountCents),
            };
          }
        }

        const payment = await tx.payment.create({
          data: {
            userId,
            subscriptionId: subscription.id,
            provider: PaymentProvider.MANUAL,
            status: PaymentStatus.SUCCEEDED,
            amountCents,
            currency: plan.currency,
          },
        });

        // Привязываем погашение купона к платежу
        if (pendingRedemption) {
          await tx.couponRedemption.update({
            where: { id: pendingRedemption.id },
            data: { paymentId: payment.id },
          });
        }
      }

      return {
        ...subscription,
        couponApplied,
      };
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

    return this.prisma.$transaction(async (tx) => {
      const canceled = await tx.subscription.update({
        where: { id: subscription.id },
        data: { status: SubscriptionStatus.CANCELED, canceledAt: new Date() },
        include: { plan: true },
      });
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          type: SubscriptionEventType.CANCELED,
          metadata: { reason: "user_cancel" },
        },
      });
      return canceled;
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
      const updateResult = await tx.coupon.updateMany({
        where: {
          id: coupon.id,
          isActive: true,
          ...(coupon.maxRedemptions !== null
            ? { redeemedCount: { lt: coupon.maxRedemptions } }
            : {}),
        },
        data: { redeemedCount: { increment: 1 } },
      });
      if (updateResult.count === 0) {
        throw new BadRequestException("Promo code redemption limit reached");
      }
      try {
        await tx.couponRedemption.create({
          data: { couponId: coupon.id, userId },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          throw new ConflictException("Promo code already redeemed");
        }
        throw e;
      }
      return {
        type: coupon.type,
        amount: coupon.amount,
        appliesOn: "next_subscription_payment" as const,
        requiresSubscriptionAction: true,
      };
    });
  }

  private assertBillingModeSafeForCurrentEnv(): void {
    const nodeEnv = this.configService.get<string>("NODE_ENV");
    const allowManualInProd =
      this.configService.get<string>("ALLOW_MANUAL_BILLING_IN_PROD") === "true";
    const billingProvider = (
      this.configService.get<string>("BILLING_PROVIDER") ?? PaymentProvider.MANUAL
    ).toUpperCase();

    if (
      nodeEnv === "production" &&
      billingProvider === PaymentProvider.MANUAL &&
      !allowManualInProd
    ) {
      throw new BadRequestException(
        "Manual billing is disabled in production. Configure payment provider integration first.",
      );
    }
  }
}
