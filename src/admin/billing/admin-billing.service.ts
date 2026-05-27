import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CouponType,
  PaymentProvider,
  PaymentStatus,
  PlanType,
  Prisma,
  SubscriptionEventType,
  SubscriptionStatus,
  UserStatus,
} from "@prisma/client";
import { ErrorCode } from "src/common/errors/error-codes";
import { MailService } from "src/mail/mail.service";
import { PrismaService } from "src/prisma.service";
import { CancelSubscriptionDto } from "./dto/cancel-subscription.dto";
import { CreateCouponDto } from "./dto/create-coupon.dto";
import { CreateManualSubscriptionDto } from "./dto/create-manual-subscription.dto";
import { CreatePlanDto } from "./dto/create-plan.dto";
import { CreateSubscriptionDto } from "./dto/create-subscription.dto";
import { ExtendSubscriptionDto } from "./dto/extend-subscription.dto";
import { FetchCouponsDto } from "./dto/fetch-coupons.dto";
import { FetchPaymentsDto } from "./dto/fetch-payments.dto";
import { FetchPlansDto } from "./dto/fetch-plans.dto";
import { FetchSubscriptionsDto } from "./dto/fetch-subscriptions.dto";
import { RefundPaymentDto } from "./dto/refund-payment.dto";
import { UpdateCouponDto } from "./dto/update-coupon.dto";
import { UpdatePlanDto } from "./dto/update-plan.dto";
import { UpdatePlanLimitsDto } from "./dto/update-plan-limits.dto";

@Injectable()
export class AdminBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // Plans
  // ─────────────────────────────────────────────────────────────

  async getPlans(dto: FetchPlansDto = {}) {
    const where: Prisma.PlanWhereInput = {};
    if (dto.onlyActive) where.isActive = true;
    if (dto.type) where.type = dto.type;
    if (dto.groupCode) where.groupCode = dto.groupCode;

    const [plans, subCounts] = await Promise.all([
      this.prisma.plan.findMany({ where, orderBy: { createdAt: "asc" } }),
      this.prisma.subscription.groupBy({
        by: ["planId"],
        where: { status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] } },
        _count: { id: true },
      }),
    ]);

    const countMap = new Map(subCounts.map((c) => [c.planId, c._count.id]));

    return plans.map((p) => ({
      ...p,
      subscriberCount: countMap.get(p.id) ?? 0,
    }));
  }

  async createPlan(dto: CreatePlanDto) {
    return this.prisma.plan.create({
      data: {
        code: dto.code,
        name: dto.name,
        type: dto.type,
        priceCents: dto.priceCents,
        currency: dto.currency ?? "RUB",
        interval: dto.interval ?? null,
        isActive: dto.isActive ?? true,
        description: dto.description ?? null,
        trialDays: dto.trialDays ?? 0,
        groupCode: dto.groupCode ?? null,
        displayColor: dto.displayColor ?? null,
        iconKey: dto.iconKey ?? null,
        highlightFeatures: dto.highlightFeatures ?? [],
        limits: (dto.limits ?? null) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async updatePlan(id: string, dto: UpdatePlanDto) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException({ code: ErrorCode.PLAN_NOT_FOUND, message: "Plan not found" });

    return this.prisma.plan.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.priceCents !== undefined && { priceCents: dto.priceCents }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.interval !== undefined && { interval: dto.interval }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.trialDays !== undefined && { trialDays: dto.trialDays }),
        ...(dto.groupCode !== undefined && { groupCode: dto.groupCode }),
        ...(dto.displayColor !== undefined && { displayColor: dto.displayColor }),
        ...(dto.iconKey !== undefined && { iconKey: dto.iconKey }),
        ...(dto.highlightFeatures !== undefined && {
          highlightFeatures: dto.highlightFeatures,
        }),
        ...(dto.limits !== undefined && {
          limits: dto.limits as unknown as Prisma.InputJsonValue,
        }),
      },
    });
  }

  async deactivatePlan(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException({ code: ErrorCode.PLAN_NOT_FOUND, message: "Plan not found" });
    if (!plan.isActive) return plan;

    return this.prisma.plan.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async deletePlan(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException({ code: ErrorCode.PLAN_NOT_FOUND, message: "Plan not found" });

    const subscriberCount = await this.prisma.subscription.count({
      where: { planId: id },
    });
    if (subscriberCount > 0) {
      throw new ConflictException(
        `Cannot delete plan with ${subscriberCount} subscription(s). Use deactivate instead.`,
      );
    }

    await this.prisma.plan.delete({ where: { id } });
  }

  async updatePlanLimits(id: string, dto: UpdatePlanLimitsDto) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException({ code: ErrorCode.PLAN_NOT_FOUND, message: "Plan not found" });

    const { replace, ...limitsPatch } = dto;
    const current =
      plan.limits && typeof plan.limits === "object" && !Array.isArray(plan.limits)
        ? (plan.limits as Prisma.JsonObject)
        : {};

    const merged = replace
      ? (limitsPatch as Prisma.JsonObject)
      : ({ ...current, ...(limitsPatch as Prisma.JsonObject) } as Prisma.JsonObject);

    return this.prisma.plan.update({
      where: { id },
      data: { limits: merged as unknown as Prisma.InputJsonValue },
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Billing KPI stats (global)
  // ─────────────────────────────────────────────────────────────

  async getBillingStats() {
    const now = Date.now();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeSubsWithPlan,
      canceledLast30,
      newUsersLast30,
      newPaidLast30,
      activeAtPeriodStart,
      // ── для дельт за предыдущий 30-дневный период ────────────────────────────
      pastPayingSubsWithPlan,
      canceledPrev30,
      newUsersPrev30,
      newPaidPrev30,
      activeAtPrevPeriodStart,
    ] = await Promise.all([
      this.prisma.user.count({
        where: { status: { not: UserStatus.DELETED } },
      }),
      this.prisma.subscription.findMany({
        where: { status: SubscriptionStatus.ACTIVE },
        select: {
          isLifetime: true,
          plan: { select: { type: true, priceCents: true, interval: true } },
        },
      }),
      this.prisma.subscription.count({
        where: {
          status: SubscriptionStatus.CANCELED,
          canceledAt: { gte: thirtyDaysAgo },
        },
      }),
      this.prisma.user.count({
        where: { signupAt: { gte: thirtyDaysAgo } },
      }),
      this.prisma.subscription.count({
        where: {
          createdAt: { gte: thirtyDaysAgo },
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
          plan: { type: { not: PlanType.FREE } },
        },
      }),
      // Subscriptions active at the start of the 30-day window (correct churn denominator)
      this.prisma.subscription.count({
        where: {
          startDate: { lte: thirtyDaysAgo },
          OR: [{ canceledAt: null }, { canceledAt: { gt: thirtyDaysAgo } }],
          plan: { type: { not: PlanType.FREE } },
        },
      }),

      // Платные подписки, активные на момент thirtyDaysAgo — для payingDeltaLast30 и MRR 30 дней назад.
      this.prisma.subscription.findMany({
        where: {
          startDate: { lte: thirtyDaysAgo },
          OR: [{ canceledAt: null }, { canceledAt: { gt: thirtyDaysAgo } }],
          plan: { type: { not: PlanType.FREE } },
        },
        select: {
          isLifetime: true,
          plan: { select: { type: true, priceCents: true, interval: true } },
        },
      }),
      this.prisma.subscription.count({
        where: {
          status: SubscriptionStatus.CANCELED,
          canceledAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
        },
      }),
      this.prisma.user.count({
        where: { signupAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
      }),
      this.prisma.subscription.count({
        where: {
          createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
          plan: { type: { not: PlanType.FREE } },
        },
      }),
      this.prisma.subscription.count({
        where: {
          startDate: { lte: sixtyDaysAgo },
          OR: [{ canceledAt: null }, { canceledAt: { gt: sixtyDaysAgo } }],
          plan: { type: { not: PlanType.FREE } },
        },
      }),
    ]);

    const payingCount = activeSubsWithPlan.filter(
      (s) => s.plan.type !== PlanType.FREE,
    ).length;

    const mrrCents = computeMrrCents(activeSubsWithPlan);
    const pastMrrCents = computeMrrCents(pastPayingSubsWithPlan);

    const conversionRate =
      newUsersLast30 > 0
        ? Math.round((newPaidLast30 / newUsersLast30) * 1000) / 10
        : 0;
    const prevConversionRate =
      newUsersPrev30 > 0
        ? Math.round((newPaidPrev30 / newUsersPrev30) * 1000) / 10
        : 0;

    const churnRate =
      activeAtPeriodStart > 0
        ? Math.round((canceledLast30 / activeAtPeriodStart) * 1000) / 10
        : 0;
    const prevChurnRate =
      activeAtPrevPeriodStart > 0
        ? Math.round((canceledPrev30 / activeAtPrevPeriodStart) * 1000) / 10
        : 0;

    // Дельты для KPI-плиток (UI показывает «+18 / +12% / +1.2 пп / +0.3 пп»).
    const payingDeltaLast30 = payingCount - activeAtPeriodStart;
    const mrrGrowthPct =
      pastMrrCents > 0
        ? Math.round(((mrrCents - pastMrrCents) / pastMrrCents) * 1000) / 10
        : null;
    const conversionDeltaPp =
      Math.round((conversionRate - prevConversionRate) * 10) / 10;
    const churnDeltaPp =
      Math.round((churnRate - prevChurnRate) * 10) / 10;

    return {
      payingCount,
      totalUsers,
      mrrCents,
      arrCents: mrrCents * 12,
      conversionRate,
      churnRate,
      payingDeltaLast30,
      mrrGrowthPct,
      conversionDeltaPp,
      churnDeltaPp,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Revenue by plan
  // ─────────────────────────────────────────────────────────────

  async getPlanRevenue() {
    const payments = await this.prisma.payment.findMany({
      where: { status: PaymentStatus.SUCCEEDED, provider: { not: PaymentProvider.MANUAL } },
      select: {
        amountCents: true,
        refundedCents: true,
        subscription: {
          select: {
            plan: { select: { id: true, code: true, name: true, type: true } },
          },
        },
      },
    });

    const revenueMap = new Map<
      string,
      { planId: string; planCode: string; planName: string; totalCents: number }
    >();

    for (const p of payments) {
      const plan = p.subscription?.plan;
      if (!plan) continue;
      const net = p.amountCents - p.refundedCents;
      const existing = revenueMap.get(plan.id);
      if (existing) {
        existing.totalCents += net;
      } else {
        revenueMap.set(plan.id, {
          planId: plan.id,
          planCode: plan.code,
          planName: plan.name,
          totalCents: net,
        });
      }
    }

    return Array.from(revenueMap.values()).sort(
      (a, b) => b.totalCents - a.totalCents,
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Subscriptions — KPI stats
  // ─────────────────────────────────────────────────────────────

  async getSubscriptionStats() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      activeCount,
      trialingCount,
      canceledCount,
      expiredCount,
      canceledLast30,
      expiredLast30,
      activeLast30,
      trialingExpiringIn7d,
    ] = await Promise.all([
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.ACTIVE } }),
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.TRIALING } }),
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.CANCELED } }),
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.EXPIRED } }),
      this.prisma.subscription.count({
        where: { status: SubscriptionStatus.CANCELED, canceledAt: { gte: thirtyDaysAgo } },
      }),
      this.prisma.subscription.count({
        where: { status: SubscriptionStatus.EXPIRED, updatedAt: { gte: thirtyDaysAgo } },
      }),
      this.prisma.subscription.count({
        where: {
          status: SubscriptionStatus.ACTIVE,
          startDate: { gte: thirtyDaysAgo },
        },
      }),
      this.prisma.subscription.count({
        where: {
          status: SubscriptionStatus.TRIALING,
          endDate: { gte: now, lte: sevenDaysAhead },
        },
      }),
    ]);

    return {
      activeCount,
      trialingCount,
      canceledCount,
      expiredCount,
      canceledLast30,
      expiredLast30,
      activeLast30,
      trialingExpiringIn7d,
      total: activeCount + trialingCount + canceledCount + expiredCount,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Subscriptions — paginated list
  // ─────────────────────────────────────────────────────────────

  async getSubscriptions(dto: FetchSubscriptionsDto) {
    const page = Math.max(1, dto.page ?? 1);
    const limit = Math.min(100, Math.max(1, dto.limit ?? 25));
    const skip = (page - 1) * limit;

    const where = this.buildSubscriptionsWhere(dto);
    const orderBy = this.buildSubscriptionsOrderBy(dto.sort);

    const [items, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          plan: { select: { id: true, code: true, name: true, type: true, priceCents: true, currency: true, interval: true } },
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              surname: true,
              username: true,
              status: true,
              lastActiveAt: true,
              signupAt: true,
            },
          },
          payments: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              amountCents: true,
              currency: true,
              status: true,
              provider: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  private buildSubscriptionsWhere(
    dto: FetchSubscriptionsDto,
  ): Prisma.SubscriptionWhereInput {
    const where: Prisma.SubscriptionWhereInput = {};
    if (dto.status) where.status = dto.status;
    if (dto.provider) where.provider = dto.provider;
    if (dto.planId) where.planId = dto.planId;
    if (dto.userId) where.userId = dto.userId;

    const planFilter: Prisma.PlanWhereInput = {};
    if (dto.planType) planFilter.type = dto.planType;
    if (dto.planCode) {
      planFilter.code = { equals: dto.planCode, mode: "insensitive" };
    }
    if (Object.keys(planFilter).length > 0) {
      where.plan = planFilter;
    }

    if (dto.search) {
      where.user = {
        OR: [
          { email: { contains: dto.search, mode: "insensitive" } },
          { name: { contains: dto.search, mode: "insensitive" } },
          { surname: { contains: dto.search, mode: "insensitive" } },
          { id: dto.search },
        ],
      };
    }

    return where;
  }

  private buildSubscriptionsOrderBy(
    sort: FetchSubscriptionsDto["sort"],
  ): Prisma.SubscriptionOrderByWithRelationInput {
    switch (sort) {
      case "nextBilling_desc":
        return { endDate: "desc" };
      case "amount_asc":
        return { plan: { priceCents: "asc" } };
      case "amount_desc":
        return { plan: { priceCents: "desc" } };
      case "createdAt_asc":
        return { createdAt: "asc" };
      case "createdAt_desc":
        return { createdAt: "desc" };
      case "nextBilling_asc":
      default:
        return { endDate: "asc" };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Subscriptions — CSV / JSON export
  // ─────────────────────────────────────────────────────────────

  async exportSubscriptions(
    dto: FetchSubscriptionsDto,
  ): Promise<{ data: unknown; format: "json" | "csv" }> {
    const where = this.buildSubscriptionsWhere(dto);
    const orderBy = this.buildSubscriptionsOrderBy(dto.sort);

    const rows = await this.prisma.subscription.findMany({
      where,
      orderBy,
      take: 10_000,
      include: {
        plan: { select: { code: true, name: true, type: true, priceCents: true, currency: true, interval: true } },
        user: { select: { id: true, email: true, name: true, surname: true } },
      },
    });

    if (dto.format === "csv") {
      const headers = [
        "id",
        "userId",
        "email",
        "name",
        "surname",
        "planCode",
        "planName",
        "planType",
        "status",
        "provider",
        "isLifetime",
        "amount",
        "currency",
        "interval",
        "startDate",
        "endDate",
        "canceledAt",
      ];
      const escape = (v: unknown) =>
        `"${String(v ?? "").replace(/"/g, '""')}"`;
      const csvRows = rows.map((s) =>
        [
          s.id,
          s.userId,
          s.user.email,
          s.user.name ?? "",
          s.user.surname ?? "",
          s.plan.code,
          s.plan.name,
          s.plan.type,
          s.status,
          s.provider,
          s.isLifetime,
          (s.plan.priceCents / 100).toFixed(2),
          s.plan.currency,
          s.plan.interval ?? "",
          s.startDate.toISOString(),
          s.endDate?.toISOString() ?? "",
          s.canceledAt?.toISOString() ?? "",
        ]
          .map(escape)
          .join(","),
      );
      const csv = [headers.join(","), ...csvRows].join("\n");
      return { data: csv, format: "csv" };
    }

    return { data: rows, format: "json" };
  }

  // ─────────────────────────────────────────────────────────────
  // Subscriptions — single detail (full user card)
  // ─────────────────────────────────────────────────────────────

  async getSubscriptionDetail(id: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id },
      include: {
        plan: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            surname: true,
            username: true,
            status: true,
            lastActiveAt: true,
            signupAt: true,
            roles: {
              include: {
                role: { select: { name: true } },
              },
            },
          },
        },
        payments: {
          orderBy: { createdAt: "desc" },
          take: 10,
          include: {
            subscription: {
              select: { plan: { select: { code: true, name: true, type: true } } },
            },
          },
        },
        events: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!sub) throw new NotFoundException({ code: ErrorCode.SUBSCRIPTION_NOT_FOUND, message: "Subscription not found" });
    return sub;
  }

  // ─────────────────────────────────────────────────────────────
  // Subscriptions — per user
  // ─────────────────────────────────────────────────────────────

  async getUserSubscriptions(userId: string) {
    return this.prisma.subscription.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { plan: true },
    });
  }

  async createUserSubscription(userId: string, dto: CreateSubscriptionDto) {
    const plan = await this.resolvePlan(dto.planId, dto.planCode);

    const now = new Date();
    const isLifetime = dto.isLifetime ?? false;
    const trialDays = dto.trialDays;
    const durationDays = dto.durationDays;

    let status: SubscriptionStatus = dto.status ?? SubscriptionStatus.ACTIVE;
    let endDate: Date | null = null;

    if (isLifetime) {
      status = SubscriptionStatus.ACTIVE;
      endDate = null;
    } else if (trialDays) {
      status = SubscriptionStatus.TRIALING;
      endDate = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    } else if (durationDays) {
      endDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
    }

    return this.prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.create({
        data: {
          userId,
          planId: plan.id,
          status,
          isLifetime,
          startDate: now,
          endDate,
          provider: dto.provider ?? "MANUAL",
        },
        include: { plan: true },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: sub.id,
          type: trialDays
            ? SubscriptionEventType.TRIAL_STARTED
            : SubscriptionEventType.SUBSCRIBED,
          metadata: {
            planCode: plan.code,
            provider: sub.provider,
            ...(dto.reason ? { reason: dto.reason } : {}),
          },
        },
      });

      return sub;
    });
  }

  async createManualSubscription(dto: CreateManualSubscriptionDto) {
    const userId = await this.resolveUserId(dto.userId, dto.email);
    return this.createUserSubscription(userId, dto);
  }

  async cancelSubscription(id: string, dto?: CancelSubscriptionDto) {
    const existing = await this.prisma.subscription.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException({ code: ErrorCode.SUBSCRIPTION_NOT_FOUND, message: "Subscription not found" });

    return this.prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.update({
        where: { id },
        data: { status: SubscriptionStatus.CANCELED, canceledAt: new Date() },
        include: { plan: true },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: id,
          type: SubscriptionEventType.CANCELED,
          ...(dto?.reason ? { metadata: { reason: dto.reason } } : {}),
        },
      });

      return sub;
    });
  }

  async extendSubscription(id: string, dto: ExtendSubscriptionDto) {
    const existing = await this.prisma.subscription.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException({ code: ErrorCode.SUBSCRIPTION_NOT_FOUND, message: "Subscription not found" });
    if (existing.isLifetime) {
      throw new BadRequestException({ code: ErrorCode.SUBSCRIPTION_CANNOT_EXTEND_LIFETIME, message: "Lifetime subscription cannot be extended" });
    }

    const base = existing.endDate ?? new Date();
    const endDate = new Date(base.getTime() + dto.extendDays * 24 * 60 * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.update({
        where: { id },
        data: { status: SubscriptionStatus.ACTIVE, endDate },
        include: { plan: true },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: id,
          type: SubscriptionEventType.EXTENDED,
          metadata: {
            extendDays: dto.extendDays,
            newEndDate: endDate,
            ...(dto.reason ? { reason: dto.reason } : {}),
          },
        },
      });

      return sub;
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Payments — KPI stats
  // ─────────────────────────────────────────────────────────────

  async getPaymentStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const [thisMonth, lastMonth] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          createdAt: { gte: startOfMonth },
          provider: { not: PaymentProvider.MANUAL },
          status: {
            in: [PaymentStatus.SUCCEEDED, PaymentStatus.REFUNDED, PaymentStatus.FAILED],
          },
        },
        select: { amountCents: true, refundedCents: true, status: true },
      }),
      this.prisma.payment.findMany({
        where: {
          createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
          provider: { not: PaymentProvider.MANUAL },
          status: {
            in: [PaymentStatus.SUCCEEDED, PaymentStatus.REFUNDED, PaymentStatus.FAILED],
          },
        },
        select: { amountCents: true, refundedCents: true, status: true },
      }),
    ]);

    const aggregate = (
      rows: { amountCents: number; refundedCents: number; status: PaymentStatus }[],
    ) => {
      const succeeded = rows.filter((p) => p.status === PaymentStatus.SUCCEEDED);
      const refunded = rows.filter((p) => p.status === PaymentStatus.REFUNDED);
      const failed = rows.filter((p) => p.status === PaymentStatus.FAILED);
      const revenueCents = succeeded.reduce(
        (sum, p) => sum + p.amountCents - p.refundedCents,
        0,
      );
      const refundCents = refunded.reduce((sum, r) => sum + r.refundedCents, 0);
      const succeededCount = succeeded.length;
      const refundCount = refunded.length;
      const failedCount = failed.length;
      const transactionCount = succeededCount + refundCount;
      const avgTicketCents =
        succeededCount > 0 ? Math.round(revenueCents / succeededCount) : 0;
      return {
        revenueCents,
        refundCents,
        succeededCount,
        refundCount,
        failedCount,
        transactionCount,
        avgTicketCents,
      };
    };

    const cur = aggregate(thisMonth);
    const prev = aggregate(lastMonth);

    const pctGrowth = (current: number, previous: number) =>
      previous > 0
        ? Math.round(((current - previous) / previous) * 1000) / 10
        : current > 0
          ? 100
          : 0;
    const absDelta = (current: number, previous: number) => current - previous;

    return {
      revenueCents: cur.revenueCents,
      revenueGrowth: pctGrowth(cur.revenueCents, prev.revenueCents),
      transactionCount: cur.transactionCount,
      transactionGrowth: absDelta(cur.transactionCount, prev.transactionCount),
      succeededCount: cur.succeededCount,
      succeededGrowth: absDelta(cur.succeededCount, prev.succeededCount),
      refundCount: cur.refundCount,
      refundGrowth: absDelta(cur.refundCount, prev.refundCount),
      refundCents: cur.refundCents,
      failedCount: cur.failedCount,
      failedGrowth: absDelta(cur.failedCount, prev.failedCount),
      avgTicketCents: cur.avgTicketCents,
      avgTicketGrowth: pctGrowth(cur.avgTicketCents, prev.avgTicketCents),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Payments — revenue by day (chart)
  // ─────────────────────────────────────────────────────────────

  async getPaymentChart(dateFrom?: string, dateTo?: string) {
    const from = dateFrom
      ? new Date(dateFrom)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const to = dateTo ? new Date(dateTo) : new Date();

    const payments = await this.prisma.payment.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        provider: { not: PaymentProvider.MANUAL },
        status: { in: [PaymentStatus.SUCCEEDED, PaymentStatus.REFUNDED] },
      },
      select: { amountCents: true, refundedCents: true, status: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    const dayMap = new Map<string, { day: string; revenueCents: number; refundCents: number }>();

    for (const p of payments) {
      const day = p.createdAt.toISOString().slice(0, 10);
      const entry = dayMap.get(day) ?? { day, revenueCents: 0, refundCents: 0 };
      if (p.status === PaymentStatus.SUCCEEDED) {
        entry.revenueCents += p.amountCents - p.refundedCents;
      } else {
        entry.refundCents += p.refundedCents;
      }
      dayMap.set(day, entry);
    }

    return Array.from(dayMap.values());
  }

  // ─────────────────────────────────────────────────────────────
  // Payments — breakdown by provider
  // ─────────────────────────────────────────────────────────────

  async getPaymentsByProvider() {
    const payments = await this.prisma.payment.findMany({
      where: { status: PaymentStatus.SUCCEEDED, provider: { not: PaymentProvider.MANUAL } },
      select: { amountCents: true, refundedCents: true, provider: true },
    });

    const provMap = new Map<string, { provider: string; totalCents: number; count: number }>();

    for (const p of payments) {
      const net = p.amountCents - p.refundedCents;
      const entry = provMap.get(p.provider) ?? { provider: p.provider, totalCents: 0, count: 0 };
      entry.totalCents += net;
      entry.count += 1;
      provMap.set(p.provider, entry);
    }

    const rows = Array.from(provMap.values()).sort((a, b) => b.totalCents - a.totalCents);
    const grandTotal = rows.reduce((s, r) => s + r.totalCents, 0);

    return rows.map((r) => ({
      ...r,
      pct: grandTotal > 0 ? Math.round((r.totalCents / grandTotal) * 1000) / 10 : 0,
    }));
  }

  // ─────────────────────────────────────────────────────────────
  // Payments — paginated list
  // ─────────────────────────────────────────────────────────────

  async getPayments(dto?: FetchPaymentsDto) {
    const page = Math.max(1, dto?.page ?? 1);
    const limit = Math.min(100, Math.max(1, dto?.limit ?? 25));
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = {};
    if (dto?.status) where.status = dto.status;
    if (dto?.provider) where.provider = dto.provider;
    if (dto?.dateFrom || dto?.dateTo) {
      where.createdAt = {
        ...(dto.dateFrom && { gte: new Date(dto.dateFrom) }),
        ...(dto.dateTo && { lte: new Date(dto.dateTo) }),
      };
    }
    if (dto?.planId) {
      where.subscription = { planId: dto.planId };
    }
    if (dto?.amountMin !== undefined || dto?.amountMax !== undefined) {
      where.amountCents = {
        ...(dto?.amountMin !== undefined && { gte: dto.amountMin }),
        ...(dto?.amountMax !== undefined && { lte: dto.amountMax }),
      };
    }
    if (dto?.search) {
      const orClauses: Prisma.PaymentWhereInput[] = [
        { providerPaymentId: { contains: dto.search, mode: "insensitive" } },
        {
          user: {
            OR: [
              { email: { contains: dto.search, mode: "insensitive" } },
              { name: { contains: dto.search, mode: "insensitive" } },
              { surname: { contains: dto.search, mode: "insensitive" } },
            ],
          },
        },
      ];
      const numeric = Number(dto.search.replace(/[\s,]/g, ""));
      if (Number.isFinite(numeric) && numeric > 0) {
        orClauses.push({ amountCents: numeric });
        orClauses.push({ amountCents: Math.round(numeric * 100) });
      }
      where.OR = orClauses;
    }

    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          subscription: {
            include: { plan: { select: { id: true, code: true, name: true, type: true, interval: true } } },
          },
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              surname: true,
              status: true,
              lastActiveAt: true,
              signupAt: true,
              roles: { include: { role: { select: { name: true } } } },
              subscriptions: {
                where: { status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] } },
                take: 1,
                orderBy: { createdAt: "desc" },
                include: { plan: { select: { type: true, code: true } } },
              },
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  // ─────────────────────────────────────────────────────────────
  // Payments — single detail
  // ─────────────────────────────────────────────────────────────

  async getPaymentDetail(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        subscription: {
          include: { plan: true },
        },
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            surname: true,
            status: true,
            lastActiveAt: true,
            signupAt: true,
            roles: { include: { role: { select: { name: true } } } },
            payments: {
              where: { id: { not: id } },
              orderBy: { createdAt: "desc" },
              take: 5,
              include: {
                subscription: {
                  select: { plan: { select: { code: true, name: true, type: true } } },
                },
              },
            },
          },
        },
      },
    });

    if (!payment) throw new NotFoundException({ code: ErrorCode.PAYMENT_NOT_FOUND, message: "Payment not found" });
    return payment;
  }

  async refundPayment(id: string, dto: RefundPaymentDto) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException({ code: ErrorCode.PAYMENT_NOT_FOUND, message: "Payment not found" });

    const remaining = payment.amountCents - payment.refundedCents;
    if (remaining <= 0) throw new BadRequestException({ code: ErrorCode.PAYMENT_ALREADY_REFUNDED, message: "Payment already fully refunded" });

    const toRefund = dto.amountCents ?? remaining;
    if (toRefund <= 0 || toRefund > remaining) {
      throw new BadRequestException({ code: ErrorCode.PAYMENT_INVALID_REFUND_AMOUNT, message: "Invalid refund amount" });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id },
        data: {
          refundedCents: { increment: toRefund },
          status: toRefund === remaining ? PaymentStatus.REFUNDED : payment.status,
        },
      });

      if (payment.subscriptionId) {
        await tx.subscriptionEvent.create({
          data: {
            subscriptionId: payment.subscriptionId,
            type: SubscriptionEventType.REFUNDED,
            metadata: {
              paymentId: id,
              refundedCents: toRefund,
              ...(dto.reason && { reason: dto.reason }),
              ...(dto.reasonNote && { reasonNote: dto.reasonNote }),
            },
          },
        });
      }

      return updated;
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Payments — CSV export
  // ─────────────────────────────────────────────────────────────

  async exportPaymentsCsv(dto?: FetchPaymentsDto) {
    const { items } = await this.getPayments({
      ...(dto ?? {}),
      page: 1,
      limit: 10_000,
    });

    const headers = [
      "id",
      "providerPaymentId",
      "createdAt",
      "userEmail",
      "userName",
      "planCode",
      "planName",
      "interval",
      "provider",
      "status",
      "amountCents",
      "refundedCents",
      "currency",
    ];
    const escape = (v: unknown) =>
      `"${String(v ?? "").replace(/"/g, '""')}"`;

    const rows = items.map((p) => {
      const fullName = [p.user?.name, p.user?.surname]
        .filter(Boolean)
        .join(" ")
        .trim();
      const plan = p.subscription?.plan;
      return [
        p.id,
        p.providerPaymentId ?? "",
        p.createdAt.toISOString(),
        p.user?.email ?? "",
        fullName,
        plan?.code ?? "",
        plan?.name ?? "",
        plan?.interval ?? "",
        p.provider,
        p.status,
        p.amountCents,
        p.refundedCents,
        p.currency,
      ]
        .map(escape)
        .join(",");
    });

    return [headers.join(","), ...rows].join("\n");
  }

  // ─────────────────────────────────────────────────────────────
  // Payments — send receipt to email
  // ─────────────────────────────────────────────────────────────

  async sendPaymentReceipt(id: string, overrideEmail?: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        user: { select: { email: true, name: true, surname: true } },
        subscription: {
          include: { plan: { select: { name: true, code: true, interval: true } } },
        },
      },
    });
    if (!payment) throw new NotFoundException({ code: ErrorCode.PAYMENT_NOT_FOUND, message: "Payment not found" });

    const to = overrideEmail?.trim() || payment.user?.email;
    if (!to) {
      throw new BadRequestException({ code: ErrorCode.PAYMENT_NO_RECIPIENT_EMAIL, message: "No recipient email available for this payment" });
    }

    const recipientName =
      [payment.user?.name, payment.user?.surname].filter(Boolean).join(" ").trim() ||
      to;

    const plan = payment.subscription?.plan;
    const periodLabel =
      plan?.interval === "month"
        ? "1 мес"
        : plan?.interval === "year"
          ? "1 год"
          : payment.subscription?.isLifetime
            ? "∞"
            : null;

    await this.mail.sendPaymentReceiptEmail({
      to,
      recipientName,
      email: to,
      paymentId: payment.id,
      providerPaymentId: payment.providerPaymentId,
      provider: payment.provider,
      status: payment.status,
      planName: plan?.name ?? null,
      planCode: plan?.code ?? null,
      period: periodLabel,
      amountCents: payment.amountCents,
      refundedCents: payment.refundedCents,
      currency: payment.currency,
      paidAt: payment.createdAt,
    });

    return { sent: true, to };
  }

  // ─────────────────────────────────────────────────────────────
  // Coupons — KPI stats
  // ─────────────────────────────────────────────────────────────

  async getCouponStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const prev30 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const [
      allCoupons,
      usagesThisMonth,
      prevMonthUsages,
      redemptionsWithPayment,
      paidLast30,
      paidWithCouponLast30,
      paidPrev30,
      paidWithCouponPrev30,
    ] = await Promise.all([
      this.prisma.coupon.findMany({
        select: {
          isActive: true,
          redeemedCount: true,
          maxRedemptions: true,
          validUntil: true,
          type: true,
          amount: true,
        },
      }),
      this.prisma.couponRedemption.count({ where: { redeemedAt: { gte: startOfMonth } } }),
      this.prisma.couponRedemption.count({
        where: { redeemedAt: { gte: startOfPrevMonth, lt: startOfMonth } },
      }),
      this.prisma.couponRedemption.findMany({
        where: { paymentId: { not: null } },
        select: {
          coupon: { select: { type: true, amount: true } },
          payment: { select: { amountCents: true } },
        },
      }),
      this.prisma.payment.count({
        where: { status: PaymentStatus.SUCCEEDED, createdAt: { gte: last30 } },
      }),
      this.prisma.payment.count({
        where: {
          status: PaymentStatus.SUCCEEDED,
          createdAt: { gte: last30 },
          couponRedemptions: { some: {} },
        },
      }),
      this.prisma.payment.count({
        where: {
          status: PaymentStatus.SUCCEEDED,
          createdAt: { gte: prev30, lt: last30 },
        },
      }),
      this.prisma.payment.count({
        where: {
          status: PaymentStatus.SUCCEEDED,
          createdAt: { gte: prev30, lt: last30 },
          couponRedemptions: { some: {} },
        },
      }),
    ]);

    let activeCount = 0;
    let expiredCount = 0;
    let exhaustedCount = 0;
    let disabledCount = 0;
    for (const c of allCoupons) {
      if (!c.isActive) {
        disabledCount++;
        continue;
      }
      if (c.validUntil && c.validUntil < now) {
        expiredCount++;
        continue;
      }
      if (c.maxRedemptions !== null && c.redeemedCount >= c.maxRedemptions) {
        exhaustedCount++;
        continue;
      }
      activeCount++;
    }

    const totalRedemptions = allCoupons.reduce((s, c) => s + c.redeemedCount, 0);
    const usageGrowth =
      prevMonthUsages > 0 ? usagesThisMonth - prevMonthUsages : usagesThisMonth;

    let totalDiscountCents = 0;
    for (const r of redemptionsWithPayment) {
      if (!r.payment) continue;
      if (r.coupon.type === CouponType.PERCENT) {
        totalDiscountCents += Math.round(
          (r.payment.amountCents * r.coupon.amount) / 100,
        );
      } else {
        totalDiscountCents += r.coupon.amount;
      }
    }

    const conversionRate = paidLast30 > 0 ? paidWithCouponLast30 / paidLast30 : 0;
    const prevConversion = paidPrev30 > 0 ? paidWithCouponPrev30 / paidPrev30 : 0;
    const conversionDelta = conversionRate - prevConversion;

    return {
      activeCount,
      expiredCount,
      exhaustedCount,
      disabledCount,
      totalCreated: allCoupons.length,
      totalRedemptions,
      usagesThisMonth,
      usageGrowth,
      totalDiscountCents,
      conversionRate,
      conversionDelta,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Coupons — paginated list
  // ─────────────────────────────────────────────────────────────

  async getCoupons(dto?: FetchCouponsDto) {
    const page = Math.max(1, dto?.page ?? 1);
    const limit = Math.min(100, Math.max(1, dto?.limit ?? 25));
    const skip = (page - 1) * limit;
    const sortBy = dto?.sortBy ?? "createdAt";
    const sortOrder = dto?.sortOrder ?? "desc";

    const where: Prisma.CouponWhereInput = {};
    const andClauses: Prisma.CouponWhereInput[] = [];

    if (dto?.type) where.type = dto.type;

    const planNorm = dto?.plan?.trim().toUpperCase();
    if (planNorm && planNorm !== "ALL") {
      andClauses.push({
        OR: [
          { applicablePlans: { has: planNorm } },
          { applicablePlans: { isEmpty: true } },
        ],
      });
    }

    if (dto?.search) {
      andClauses.push({
        OR: [
          { code: { contains: dto.search, mode: "insensitive" } },
          { name: { contains: dto.search, mode: "insensitive" } },
        ],
      });
    }

    // Status filter — done via id whitelist for "exhausted" because Prisma
    // can't compare two columns. For consistency we route all status filters
    // through the same path so where-clause stays simple.
    const now = new Date();
    if (dto?.status) {
      const candidates = await this.prisma.coupon.findMany({
        select: {
          id: true,
          isActive: true,
          validUntil: true,
          maxRedemptions: true,
          redeemedCount: true,
        },
      });
      const matchedIds = candidates
        .filter(
          (c) =>
            this.computeCouponStatus({
              isActive: c.isActive,
              validUntil: c.validUntil,
              maxRedemptions: c.maxRedemptions,
              redeemedCount: c.redeemedCount,
            }) === dto.status,
        )
        .map((c) => c.id);
      andClauses.push({ id: { in: matchedIds } });
    }

    if (andClauses.length) where.AND = andClauses;

    const orderBy: Prisma.CouponOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [items, total] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: { _count: { select: { redemptions: true } } },
      }),
      this.prisma.coupon.count({ where }),
    ]);

    // Compute status for each coupon
    const enriched = items.map((c) => ({
      ...c,
      computedStatus: this.computeCouponStatus(c),
    }));

    return { items: enriched, total, page, limit };
  }

  // ─────────────────────────────────────────────────────────────
  // Coupons — single detail with last redemptions
  // ─────────────────────────────────────────────────────────────

  async getCouponDetail(id: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      include: {
        _count: { select: { redemptions: true } },
        redemptions: {
          orderBy: { redeemedAt: "desc" },
          take: 10,
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                surname: true,
                subscriptions: {
                  where: { status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] } },
                  take: 1,
                  orderBy: { createdAt: "desc" },
                  include: { plan: { select: { code: true, type: true } } },
                },
              },
            },
          },
        },
      },
    });

    if (!coupon) throw new NotFoundException({ code: ErrorCode.COUPON_NOT_FOUND, message: "Coupon not found" });

    return { ...coupon, computedStatus: this.computeCouponStatus(coupon) };
  }

  // ─────────────────────────────────────────────────────────────
  // Coupons — CRUD
  // ─────────────────────────────────────────────────────────────

  async createCoupon(dto: CreateCouponDto) {
    if (dto.type === CouponType.PERCENT && dto.amount > 100) {
      throw new BadRequestException({ code: ErrorCode.COUPON_INVALID_AMOUNT, message: "Percent coupon amount must be <= 100" });
    }

    return this.prisma.coupon.create({
      data: {
        code: dto.code.toUpperCase(),
        name: dto.name ?? null,
        type: dto.type,
        amount: dto.amount,
        maxRedemptions: dto.maxRedemptions ?? null,
        maxPerUser: dto.maxPerUser ?? null,
        newUsersOnly: dto.newUsersOnly ?? false,
        isStackable: dto.isStackable ?? false,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        applicablePlans: this.normalizePlanCodes(dto.applicablePlans),
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateCoupon(id: string, dto: UpdateCouponDto) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException({ code: ErrorCode.COUPON_NOT_FOUND, message: "Coupon not found" });

    if (dto.type === CouponType.PERCENT && dto.amount && dto.amount > 100) {
      throw new BadRequestException({ code: ErrorCode.COUPON_INVALID_AMOUNT, message: "Percent coupon amount must be <= 100" });
    }

    return this.prisma.coupon.update({
      where: { id },
      data: {
        ...(dto.code !== undefined && { code: dto.code.toUpperCase() }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.maxRedemptions !== undefined && { maxRedemptions: dto.maxRedemptions }),
        ...(dto.maxPerUser !== undefined && { maxPerUser: dto.maxPerUser }),
        ...(dto.newUsersOnly !== undefined && { newUsersOnly: dto.newUsersOnly }),
        ...(dto.isStackable !== undefined && { isStackable: dto.isStackable }),
        ...(dto.validFrom !== undefined && {
          validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        }),
        ...(dto.validUntil !== undefined && {
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        }),
        ...(dto.applicablePlans !== undefined && {
          applicablePlans: this.normalizePlanCodes(dto.applicablePlans),
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async deactivateCoupon(id: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException({ code: ErrorCode.COUPON_NOT_FOUND, message: "Coupon not found" });

    return this.prisma.coupon.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async activateCoupon(id: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException({ code: ErrorCode.COUPON_NOT_FOUND, message: "Coupon not found" });

    return this.prisma.coupon.update({
      where: { id },
      data: { isActive: true },
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Coupons — CSV export
  // ─────────────────────────────────────────────────────────────

  async exportCouponsCsv(dto?: FetchCouponsDto): Promise<string> {
    const all = await this.getCoupons({
      ...dto,
      page: 1,
      limit: 100,
    });
    // If there are more pages, fetch them too — callers shouldn't paginate exports.
    const items = [...all.items];
    const totalPages = Math.ceil(all.total / 100);
    for (let p = 2; p <= totalPages; p++) {
      const next = await this.getCoupons({ ...dto, page: p, limit: 100 });
      items.push(...next.items);
    }

    const header = [
      "code",
      "name",
      "type",
      "amount",
      "redeemedCount",
      "maxRedemptions",
      "maxPerUser",
      "newUsersOnly",
      "isStackable",
      "applicablePlans",
      "validFrom",
      "validUntil",
      "isActive",
      "computedStatus",
      "createdAt",
    ];
    const escape = (v: unknown): string => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = items.map((c) =>
      [
        c.code,
        c.name ?? "",
        c.type,
        c.amount,
        c.redeemedCount,
        c.maxRedemptions ?? "",
        c.maxPerUser ?? "",
        c.newUsersOnly,
        c.isStackable,
        (c.applicablePlans ?? []).join("|"),
        c.validFrom?.toISOString() ?? "",
        c.validUntil?.toISOString() ?? "",
        c.isActive,
        c.computedStatus,
        c.createdAt.toISOString(),
      ]
        .map(escape)
        .join(","),
    );
    return [header.join(","), ...rows].join("\n");
  }

  async deleteCoupon(id: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException({ code: ErrorCode.COUPON_NOT_FOUND, message: "Coupon not found" });
    if (coupon.redeemedCount > 0) {
      throw new BadRequestException(
        "Cannot delete a coupon that has been redeemed. Deactivate it instead.",
      );
    }
    await this.prisma.coupon.delete({ where: { id } });
  }

  async redeemCoupon(userId: string, couponCode: string, paymentId?: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: couponCode },
    });
    if (!coupon || !coupon.isActive) {
      throw new BadRequestException({ code: ErrorCode.COUPON_INVALID, message: "Invalid coupon" });
    }

    const now = new Date();
    if (coupon.validFrom && coupon.validFrom > now) {
      throw new BadRequestException({ code: ErrorCode.COUPON_NOT_ACTIVE_YET, message: "Coupon not active yet" });
    }
    if (coupon.validUntil && coupon.validUntil < now) {
      throw new BadRequestException({ code: ErrorCode.COUPON_EXPIRED, message: "Coupon expired" });
    }
    if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) {
      throw new BadRequestException({ code: ErrorCode.COUPON_LIMIT_REACHED, message: "Coupon redemption limit reached" });
    }

    if (coupon.maxPerUser !== null) {
      const userUsages = await this.prisma.couponRedemption.count({
        where: { couponId: coupon.id, userId },
      });
      if (userUsages >= coupon.maxPerUser) {
        throw new BadRequestException({ code: ErrorCode.COUPON_PER_USER_LIMIT_REACHED, message: "Coupon per-user limit reached" });
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.coupon.update({
        where: { id: coupon.id },
        data: { redeemedCount: { increment: 1 } },
      });
      const redemption = await tx.couponRedemption.create({
        data: {
          couponId: updated.id,
          userId,
          paymentId: paymentId ?? null,
        },
      });
      return { coupon: updated, redemption };
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────

  private async resolvePlan(planId?: string, planCode?: string) {
    if (planId) {
      const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
      if (!plan) throw new NotFoundException({ code: ErrorCode.PLAN_NOT_FOUND, message: "Plan not found" });
      return plan;
    }
    if (planCode) {
      const plan = await this.prisma.plan.findUnique({
        where: { code: planCode.toUpperCase() },
      });
      if (!plan) throw new NotFoundException({ code: ErrorCode.PLAN_NOT_FOUND, message: "Plan not found" });
      return plan;
    }
    throw new BadRequestException({ code: ErrorCode.PLAN_ID_OR_CODE_REQUIRED, message: "Either planId or planCode is required" });
  }

  private async resolveUserId(userId?: string, email?: string): Promise<string> {
    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) throw new NotFoundException({ code: ErrorCode.USER_NOT_FOUND, message: "User not found" });
      return user.id;
    }
    if (email) {
      const user = await this.prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true },
      });
      if (!user) throw new NotFoundException({ code: ErrorCode.USER_NOT_FOUND, message: "User not found by email" });
      return user.id;
    }
    throw new BadRequestException({ code: ErrorCode.USER_ID_OR_EMAIL_REQUIRED, message: "Either userId or email is required" });
  }

  private computeCouponStatus(c: {
    isActive: boolean;
    validUntil: Date | null;
    maxRedemptions: number | null;
    redeemedCount: number;
  }): "active" | "expired" | "exhausted" | "disabled" {
    if (!c.isActive) return "disabled";
    const now = new Date();
    if (c.validUntil && c.validUntil < now) return "expired";
    if (c.maxRedemptions !== null && c.redeemedCount >= c.maxRedemptions) return "exhausted";
    return "active";
  }

  private normalizePlanCodes(plans: string[] | undefined | null): string[] {
    if (!plans) return [];
    return Array.from(
      new Set(
        plans
          .map((p) => p?.trim().toUpperCase())
          .filter((p): p is string => !!p && p !== "ALL"),
      ),
    );
  }
}

// Считает MRR в копейках по списку подписок: только не-FREE и не-lifetime,
// годовые тарифы делятся на 12.
function computeMrrCents(
  subs: ReadonlyArray<{
    isLifetime: boolean;
    plan: { type: PlanType; priceCents: number; interval: string | null };
  }>,
): number {
  let mrr = 0;
  for (const sub of subs) {
    if (sub.isLifetime || sub.plan.type === PlanType.FREE) continue;
    if (sub.plan.interval === "month") {
      mrr += sub.plan.priceCents;
    } else if (sub.plan.interval === "year") {
      mrr += Math.round(sub.plan.priceCents / 12);
    }
  }
  return mrr;
}
