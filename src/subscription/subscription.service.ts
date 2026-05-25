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
import { ErrorCode } from "src/common/errors/error-codes";

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

  async getMyPayments(userId: string, opts?: { limit?: number; cursor?: string }) {
    const limit = Math.min(100, Math.max(1, opts?.limit ?? 20));
    const cursor = opts?.cursor;

    const items = await this.prisma.payment.findMany({
      where: { userId },
      include: {
        subscription: { include: { plan: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? page[page.length - 1]!.id : null;

    return { items: page, nextCursor, hasMore };
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

    const planLimits =
      (subscription?.plan?.limits as Record<string, unknown> | null) ?? null;

    return {
      translationsToday,
      wordsInDictionary,
      // Полный limits-объект отдаём, чтобы фронт мог построить feature-list карточек и сравнительную таблицу
      limits: planLimits ?? {
        translationsPerDay: 50,
        wordsInDictionary: 500,
      },
    };
  }

  async subscribeToPlan(
    userId: string,
    ref: { planId?: string; planCode?: string },
  ) {
    this.assertBillingModeSafeForCurrentEnv();
    const plan = await this.resolvePlan(ref);
    const planId = plan.id;

    // Пункт 2: подписка на FREE через этот эндпоинт запрещена
    if (plan.type === PlanType.FREE) {
      throw new BadRequestException({ code: ErrorCode.USE_DELETE_TO_DOWNGRADE, message: "Use DELETE /subscription to downgrade to free" });
    }

    // Пункт 1: уже подписан на этот план
    const current = await this.getMySubscription(userId);
    if (current?.planId === planId) {
      throw new ConflictException({ code: ErrorCode.ALREADY_SUBSCRIBED, message: "Already subscribed to this plan" });
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

    if (!subscription) throw new NotFoundException({ code: ErrorCode.NO_ACTIVE_SUBSCRIPTION, message: "No active subscription found" });

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
      throw new NotFoundException({ code: ErrorCode.PROMO_NOT_FOUND, message: "Promo code not found or inactive" });

    const now = new Date();
    if (coupon.validFrom && coupon.validFrom > now)
      throw new BadRequestException({ code: ErrorCode.PROMO_NOT_YET_VALID, message: "Promo code is not yet valid" });
    if (coupon.validUntil && coupon.validUntil < now)
      throw new BadRequestException({ code: ErrorCode.PROMO_EXPIRED, message: "Promo code has expired" });
    if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions)
      throw new BadRequestException({ code: ErrorCode.PROMO_LIMIT_REACHED, message: "Promo code redemption limit reached" });

    const existing = await this.prisma.couponRedemption.findFirst({
      where: { couponId: coupon.id, userId },
    });
    if (existing) throw new ConflictException({ code: ErrorCode.PROMO_ALREADY_REDEEMED, message: "Promo code already redeemed" });

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
        throw new BadRequestException({ code: ErrorCode.PROMO_LIMIT_REACHED, message: "Promo code redemption limit reached" });
      }
      try {
        await tx.couponRedemption.create({
          data: { couponId: coupon.id, userId },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          throw new ConflictException({ code: ErrorCode.PROMO_ALREADY_REDEEMED, message: "Promo code already redeemed" });
        }
        throw e;
      }
      return {
        code: coupon.code,
        name: coupon.name,
        type: coupon.type,
        amount: coupon.amount,
        // Купон сохранён, но скидка применится только при следующем POST /subscription/subscribe.
        // Списания денег и моментальной модификации текущей подписки НЕ происходит.
        status: "saved_for_next_subscription" as const,
        appliesOn: "next_subscription_payment" as const,
        requiresSubscriptionAction: true,
      };
    });
  }

  async startTrial(userId: string, ref: { planId?: string; planCode?: string }) {
    this.assertBillingModeSafeForCurrentEnv();

    const plan = await this.resolvePlan(ref);
    const planId = plan.id;
    if (plan.type === PlanType.FREE) {
      throw new BadRequestException({ code: ErrorCode.TRIAL_NOT_APPLICABLE, message: "Trial is not applicable to FREE plan" });
    }
    if (plan.trialDays <= 0) {
      throw new BadRequestException({ code: ErrorCode.TRIAL_NOT_AVAILABLE, message: "Trial is not available for this plan" });
    }

    // Уже есть активная/триальная подписка
    const current = await this.getMySubscription(userId);
    if (current) {
      throw new ConflictException({ code: ErrorCode.ALREADY_HAS_ACTIVE_SUBSCRIPTION, message: "You already have an active subscription. Cancel it before starting a trial." });
    }

    // Триал даётся один раз — проверяем по любому событию TRIAL_STARTED у этого пользователя
    const trialStartedBefore = await this.prisma.subscriptionEvent.findFirst({
      where: {
        type: SubscriptionEventType.TRIAL_STARTED,
        subscription: { userId },
      },
      select: { id: true },
    });
    if (trialStartedBefore) {
      throw new ConflictException({ code: ErrorCode.TRIAL_ALREADY_USED, message: "Trial has already been used" });
    }

    const now = new Date();
    const endDate = new Date(now.getTime() + plan.trialDays * 24 * 60 * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          userId,
          planId,
          status: SubscriptionStatus.TRIALING,
          startDate: now,
          endDate,
          provider: PaymentProvider.MANUAL,
        },
        include: { plan: true },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          type: SubscriptionEventType.TRIAL_STARTED,
          metadata: { planCode: plan.code, trialDays: plan.trialDays },
        },
      });

      return subscription;
    });
  }

  private async resolvePlan(ref: { planId?: string; planCode?: string }) {
    const { planId, planCode } = ref;
    if (!planId && !planCode) {
      throw new BadRequestException({ code: ErrorCode.PLAN_ID_OR_CODE_REQUIRED, message: "Either planId or planCode must be provided" });
    }
    if (planId && planCode) {
      throw new BadRequestException({ code: ErrorCode.PLAN_ID_AND_CODE_CONFLICT, message: "Provide only one of planId or planCode, not both" });
    }
    const plan = planId
      ? await this.prisma.plan.findUnique({ where: { id: planId } })
      : await this.prisma.plan.findUnique({ where: { code: planCode! } });
    if (!plan || !plan.isActive) {
      throw new NotFoundException({ code: ErrorCode.PLAN_NOT_FOUND, message: "Plan not found or inactive" });
    }
    return plan;
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
      throw new BadRequestException({ code: ErrorCode.MANUAL_BILLING_DISABLED, message: "Manual billing is disabled in production. Configure payment provider integration first." });
    }
  }
}
