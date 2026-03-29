import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CouponType,
  PaymentStatus,
  PlanType,
  Prisma,
  SubscriptionEventType,
  SubscriptionStatus,
  UserStatus,
} from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { CreateCouponDto } from "./dto/create-coupon.dto";
import { CreatePlanDto } from "./dto/create-plan.dto";
import { CreateSubscriptionDto } from "./dto/create-subscription.dto";
import { ExtendSubscriptionDto } from "./dto/extend-subscription.dto";
import { FetchCouponsDto } from "./dto/fetch-coupons.dto";
import { FetchPaymentsDto } from "./dto/fetch-payments.dto";
import { FetchSubscriptionsDto } from "./dto/fetch-subscriptions.dto";
import { RefundPaymentDto } from "./dto/refund-payment.dto";
import { UpdateCouponDto } from "./dto/update-coupon.dto";
import { UpdatePlanDto } from "./dto/update-plan.dto";

@Injectable()
export class AdminBillingService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────
  // Plans
  // ─────────────────────────────────────────────────────────────

  async getPlans() {
    const [plans, subCounts] = await Promise.all([
      this.prisma.plan.findMany({ orderBy: { createdAt: "asc" } }),
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
        limits: (dto.limits ?? null) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async updatePlan(id: string, dto: UpdatePlanDto) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException("Plan not found");

    return this.prisma.plan.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.priceCents !== undefined && { priceCents: dto.priceCents }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.interval !== undefined && { interval: dto.interval }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.limits !== undefined && {
          limits: dto.limits as unknown as Prisma.InputJsonValue,
        }),
      },
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Billing KPI stats (global)
  // ─────────────────────────────────────────────────────────────

  async getBillingStats() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeSubsWithPlan,
      canceledLast30,
      newUsersLast30,
      newPaidLast30,
      activeAtPeriodStart,
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
    ]);

    const payingCount = activeSubsWithPlan.filter(
      (s) => s.plan.type !== PlanType.FREE,
    ).length;

    let mrrCents = 0;
    for (const sub of activeSubsWithPlan) {
      if (sub.isLifetime || sub.plan.type === PlanType.FREE) continue;
      if (sub.plan.interval === "month") {
        mrrCents += sub.plan.priceCents;
      } else if (sub.plan.interval === "year") {
        mrrCents += Math.round(sub.plan.priceCents / 12);
      }
    }

    const conversionRate =
      newUsersLast30 > 0
        ? Math.round((newPaidLast30 / newUsersLast30) * 1000) / 10
        : 0;

    const churnRate =
      activeAtPeriodStart > 0
        ? Math.round((canceledLast30 / activeAtPeriodStart) * 1000) / 10
        : 0;

    return {
      payingCount,
      totalUsers,
      mrrCents,
      arrCents: mrrCents * 12,
      conversionRate,
      churnRate,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Revenue by plan
  // ─────────────────────────────────────────────────────────────

  async getPlanRevenue() {
    const payments = await this.prisma.payment.findMany({
      where: { status: PaymentStatus.SUCCEEDED },
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
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [activeCount, trialingCount, canceledCount, expiredCount, canceledLast30, expiredLast30] =
      await Promise.all([
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
      ]);

    return {
      activeCount,
      trialingCount,
      canceledCount,
      expiredCount,
      canceledLast30,
      expiredLast30,
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

    const where: Prisma.SubscriptionWhereInput = {};
    if (dto.status) where.status = dto.status;
    if (dto.provider) where.provider = dto.provider;
    if (dto.planId) where.planId = dto.planId;
    if (dto.userId) where.userId = dto.userId;
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

    const [items, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        skip,
        take: limit,
        orderBy: { endDate: "asc" },
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
        },
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return { items, total, page, limit };
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
          take: 5,
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

    if (!sub) throw new NotFoundException("Subscription not found");
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
    const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
    if (!plan) throw new NotFoundException("Plan not found");

    const now = new Date();
    const isLifetime = dto.isLifetime ?? false;
    const trialDays = dto.trialDays;

    let status: SubscriptionStatus = dto.status ?? SubscriptionStatus.ACTIVE;
    let endDate: Date | null = null;

    if (isLifetime) {
      status = SubscriptionStatus.ACTIVE;
      endDate = null;
    } else if (trialDays) {
      status = SubscriptionStatus.TRIALING;
      endDate = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    }

    return this.prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.create({
        data: {
          userId,
          planId: dto.planId,
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
          metadata: { planCode: plan.code, provider: sub.provider },
        },
      });

      return sub;
    });
  }

  async cancelSubscription(id: string) {
    const existing = await this.prisma.subscription.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Subscription not found");

    return this.prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.update({
        where: { id },
        data: { status: SubscriptionStatus.CANCELED, canceledAt: new Date() },
        include: { plan: true },
      });

      await tx.subscriptionEvent.create({
        data: { subscriptionId: id, type: SubscriptionEventType.CANCELED },
      });

      return sub;
    });
  }

  async extendSubscription(id: string, dto: ExtendSubscriptionDto) {
    const existing = await this.prisma.subscription.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Subscription not found");
    if (existing.isLifetime) {
      throw new BadRequestException("Lifetime subscription cannot be extended");
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
          metadata: { extendDays: dto.extendDays, newEndDate: endDate },
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

    const [thisMonthPayments, lastMonthRevenue, refunds, failed] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          createdAt: { gte: startOfMonth },
          status: { in: [PaymentStatus.SUCCEEDED, PaymentStatus.REFUNDED] },
        },
        select: { amountCents: true, refundedCents: true, status: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
          status: PaymentStatus.SUCCEEDED,
        },
        _sum: { amountCents: true },
      }),
      this.prisma.payment.findMany({
        where: { createdAt: { gte: startOfMonth }, status: PaymentStatus.REFUNDED },
        select: { refundedCents: true },
      }),
      this.prisma.payment.count({
        where: { createdAt: { gte: startOfMonth }, status: PaymentStatus.FAILED },
      }),
    ]);

    const totalCount = thisMonthPayments.length;
    const succeededPayments = thisMonthPayments.filter(
      (p) => p.status === PaymentStatus.SUCCEEDED,
    );
    const succeededCount = succeededPayments.length;
    const revenueCents = succeededPayments.reduce(
      (sum, p) => sum + p.amountCents - p.refundedCents,
      0,
    );

    const lastMonthRevenueCents = lastMonthRevenue._sum.amountCents ?? 0;
    const revenueGrowth =
      lastMonthRevenueCents > 0
        ? Math.round(((revenueCents - lastMonthRevenueCents) / lastMonthRevenueCents) * 1000) / 10
        : 0;

    const refundCount = refunds.length;
    const refundCents = refunds.reduce((sum, r) => sum + r.refundedCents, 0);
    const avgTicketCents =
      succeededCount > 0 ? Math.round(revenueCents / succeededCount) : 0;

    return {
      revenueCents,
      revenueGrowth,
      transactionCount: totalCount,
      refundCount,
      refundCents,
      failedCount: failed,
      avgTicketCents,
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
      where: { status: PaymentStatus.SUCCEEDED },
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
    if (dto?.search) {
      where.OR = [
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

    if (!payment) throw new NotFoundException("Payment not found");
    return payment;
  }

  async refundPayment(id: string, dto: RefundPaymentDto) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException("Payment not found");

    const remaining = payment.amountCents - payment.refundedCents;
    if (remaining <= 0) throw new BadRequestException("Payment already fully refunded");

    const toRefund = dto.amountCents ?? remaining;
    if (toRefund <= 0 || toRefund > remaining) {
      throw new BadRequestException("Invalid refund amount");
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
            metadata: { paymentId: id, refundedCents: toRefund },
          },
        });
      }

      return updated;
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Coupons — KPI stats
  // ─────────────────────────────────────────────────────────────

  async getCouponStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [allCoupons, usagesThisMonth, prevMonthUsages] = await Promise.all([
      this.prisma.coupon.findMany({
        select: {
          isActive: true,
          redeemedCount: true,
          maxRedemptions: true,
          validUntil: true,
        },
      }),
      this.prisma.couponRedemption.count({ where: { redeemedAt: { gte: startOfMonth } } }),
      this.prisma.couponRedemption.count({
        where: {
          redeemedAt: {
            gte: new Date(now.getFullYear(), now.getMonth() - 1, 1),
            lt: startOfMonth,
          },
        },
      }),
    ]);

    const activeCount = allCoupons.filter((c) => {
      if (!c.isActive) return false;
      if (c.validUntil && c.validUntil < now) return false;
      if (c.maxRedemptions !== null && c.redeemedCount >= c.maxRedemptions) return false;
      return true;
    }).length;

    const totalRedemptions = allCoupons.reduce((s, c) => s + c.redeemedCount, 0);
    const usageGrowth =
      prevMonthUsages > 0
        ? usagesThisMonth - prevMonthUsages
        : usagesThisMonth;

    return {
      activeCount,
      totalCreated: allCoupons.length,
      totalRedemptions,
      usagesThisMonth,
      usageGrowth,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Coupons — paginated list
  // ─────────────────────────────────────────────────────────────

  async getCoupons(dto?: FetchCouponsDto) {
    const page = Math.max(1, dto?.page ?? 1);
    const limit = Math.min(100, Math.max(1, dto?.limit ?? 25));
    const skip = (page - 1) * limit;

    const where: Prisma.CouponWhereInput = {};
    if (dto?.type) where.type = dto.type;
    if (dto?.plan) {
      where.OR = [
        { applicablePlans: { has: dto.plan } },
        { applicablePlans: { isEmpty: true } },
      ];
    }
    if (dto?.search) {
      where.OR = [
        { code: { contains: dto.search, mode: "insensitive" } },
        { name: { contains: dto.search, mode: "insensitive" } },
      ];
    }

    const now = new Date();
    if (dto?.status === "active") {
      where.isActive = true;
      where.AND = [
        { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
      ];
    } else if (dto?.status === "expired") {
      where.validUntil = { lt: now };
    } else if (dto?.status === "exhausted") {
      where.maxRedemptions = { not: null };
      where.redeemedCount = { gte: 1 };
    }

    const [items, total] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
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

    if (!coupon) throw new NotFoundException("Coupon not found");

    return { ...coupon, computedStatus: this.computeCouponStatus(coupon) };
  }

  // ─────────────────────────────────────────────────────────────
  // Coupons — CRUD
  // ─────────────────────────────────────────────────────────────

  async createCoupon(dto: CreateCouponDto) {
    if (dto.type === CouponType.PERCENT && dto.amount > 100) {
      throw new BadRequestException("Percent coupon amount must be <= 100");
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
        applicablePlans: dto.applicablePlans ?? [],
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateCoupon(id: string, dto: UpdateCouponDto) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException("Coupon not found");

    if (dto.type === CouponType.PERCENT && dto.amount && dto.amount > 100) {
      throw new BadRequestException("Percent coupon amount must be <= 100");
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
        ...(dto.applicablePlans !== undefined && { applicablePlans: dto.applicablePlans }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async deactivateCoupon(id: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException("Coupon not found");

    return this.prisma.coupon.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async deleteCoupon(id: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException("Coupon not found");
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
      throw new BadRequestException("Invalid coupon");
    }

    const now = new Date();
    if (coupon.validFrom && coupon.validFrom > now) {
      throw new BadRequestException("Coupon not active yet");
    }
    if (coupon.validUntil && coupon.validUntil < now) {
      throw new BadRequestException("Coupon expired");
    }
    if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) {
      throw new BadRequestException("Coupon redemption limit reached");
    }

    if (coupon.maxPerUser !== null) {
      const userUsages = await this.prisma.couponRedemption.count({
        where: { couponId: coupon.id, userId },
      });
      if (userUsages >= coupon.maxPerUser) {
        throw new BadRequestException("Coupon per-user limit reached");
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
}
