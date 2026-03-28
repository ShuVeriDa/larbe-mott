import { Injectable } from "@nestjs/common";
import {
  FeedbackStatus,
  PaymentStatus,
  PlanType,
  SubscriptionStatus,
  UserEventType,
  UserStatus,
} from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { DashboardQueryDto } from "./dto/dashboard-query.dto";

type Granularity = "day" | "month";

interface PeriodBounds {
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  granularity: Granularity;
}

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(query: DashboardQueryDto) {
    const bounds = this.resolvePeriod(query);

    const [kpi, chart, content, recentUsers, activityFeed, support, billing, unknownWords, featureFlags] =
      await Promise.all([
        this.getKpi(bounds),
        this.getRegistrationsChart(bounds),
        this.getContentStats(bounds),
        this.getRecentUsers(),
        this.getActivityFeed(),
        this.getSupportSummary(),
        this.getBillingSummary(),
        this.getUnknownWordsSummary(),
        this.getFeatureFlags(),
      ]);

    return { kpi, chart, content, recentUsers, activityFeed, support, billing, unknownWords, featureFlags };
  }

  // ─── Period ────────────────────────────────────────────────────────────────

  private resolvePeriod(query: DashboardQueryDto): PeriodBounds {
    const now = new Date();
    let from: Date;
    let to: Date = now;

    if (query.dateFrom && query.dateTo) {
      from = new Date(query.dateFrom);
      to = new Date(query.dateTo);
    } else {
      switch (query.period ?? "month") {
        case "week":
          from = new Date(now.getTime() - 7 * 86_400_000);
          break;
        case "year":
          from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          break;
        case "all":
          from = new Date(2020, 0, 1);
          break;
        default: // month
          from = new Date(now.getFullYear(), now.getMonth(), 1);
      }
    }

    const durationMs = to.getTime() - from.getTime();
    const granularity: Granularity = durationMs > 90 * 86_400_000 ? "month" : "day";

    const prevFrom = new Date(from.getTime() - durationMs);
    const prevTo = new Date(from);

    return { from, to, prevFrom, prevTo, granularity };
  }

  // ─── KPI ───────────────────────────────────────────────────────────────────

  private async getKpi({ from, to, prevFrom, prevTo }: PeriodBounds) {
    const notDeleted = { not: UserStatus.DELETED };
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000);
    const paidPlanFilter = { plan: { type: { not: PlanType.FREE } } };
    const activeSubStatus = {
      status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] as SubscriptionStatus[] },
    };

    const [
      totalUsers,
      newUsersNow,
      newUsersPrev,
      activeUsers7d,
      activeUsersPrev7d,
      paidSubsTotal,
      newPaidSubsNow,
      newPaidSubsPrev,
      revenueNow,
      revenuePrev,
    ] = await Promise.all([
      this.prisma.user.count({ where: { status: notDeleted } }),
      this.prisma.user.count({
        where: { status: notDeleted, createdAt: { gte: from, lte: to } },
      }),
      this.prisma.user.count({
        where: { status: notDeleted, createdAt: { gte: prevFrom, lte: prevTo } },
      }),
      this.prisma.user.count({
        where: { status: notDeleted, lastActiveAt: { gte: sevenDaysAgo } },
      }),
      this.prisma.user.count({
        where: {
          status: notDeleted,
          lastActiveAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
        },
      }),
      this.prisma.subscription.count({ where: { ...activeSubStatus, ...paidPlanFilter } }),
      this.prisma.subscription.count({
        where: { ...paidPlanFilter, createdAt: { gte: from, lte: to } },
      }),
      this.prisma.subscription.count({
        where: { ...paidPlanFilter, createdAt: { gte: prevFrom, lte: prevTo } },
      }),
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.SUCCEEDED, createdAt: { gte: from, lte: to } },
        _sum: { amountCents: true, refundedCents: true },
      }),
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.SUCCEEDED, createdAt: { gte: prevFrom, lte: prevTo } },
        _sum: { amountCents: true, refundedCents: true },
      }),
    ]);

    const revenueCents =
      (revenueNow._sum.amountCents ?? 0) - (revenueNow._sum.refundedCents ?? 0);
    const revenuePrevCents =
      (revenuePrev._sum.amountCents ?? 0) - (revenuePrev._sum.refundedCents ?? 0);

    return {
      totalUsers,
      newUsersInPeriod: newUsersNow,
      newUsersTrend: this.pctChange(newUsersNow, newUsersPrev),
      activeUsers7d,
      activeUsers7dTrend: this.pctChange(activeUsers7d, activeUsersPrev7d),
      paidSubscriptions: paidSubsTotal,
      newPaidSubsInPeriod: newPaidSubsNow,
      paidSubsTrend: newPaidSubsNow - newPaidSubsPrev,
      revenueCents,
      revenuePrevCents,
      revenueTrend: this.pctChange(revenueCents, revenuePrevCents),
    };
  }

  private pctChange(current: number, prev: number): number | null {
    if (prev === 0) return null;
    return Math.round(((current - prev) / prev) * 100);
  }

  // ─── Registrations chart ───────────────────────────────────────────────────

  private async getRegistrationsChart({ from, to, granularity }: PeriodBounds) {
    const [newUsers, sessions] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          createdAt: { gte: from, lte: to },
          status: { not: UserStatus.DELETED },
        },
        select: { createdAt: true },
      }),
      this.prisma.userEvent.findMany({
        where: {
          type: UserEventType.START_SESSION,
          createdAt: { gte: from, lte: to },
        },
        select: { userId: true, createdAt: true },
      }),
    ]);

    const labels = this.buildLabels(from, to, granularity);
    const newUsersData = new Array<number>(labels.length).fill(0);
    const activeUserSets = labels.map(() => new Set<string>());

    for (const u of newUsers) {
      const idx = this.bucketIndex(u.createdAt, from, granularity);
      if (idx >= 0 && idx < labels.length) newUsersData[idx]++;
    }

    for (const e of sessions) {
      const idx = this.bucketIndex(e.createdAt, from, granularity);
      if (idx >= 0 && idx < labels.length) activeUserSets[idx].add(e.userId);
    }

    return {
      labels,
      newUsers: newUsersData,
      activeUsers: activeUserSets.map((s) => s.size),
    };
  }

  private buildLabels(from: Date, to: Date, granularity: Granularity): string[] {
    const labels: string[] = [];
    const current = new Date(from);

    if (granularity === "day") {
      while (current <= to) {
        labels.push(current.toISOString().slice(0, 10));
        current.setDate(current.getDate() + 1);
      }
    } else {
      current.setDate(1);
      while (current <= to) {
        labels.push(current.toISOString().slice(0, 7));
        current.setMonth(current.getMonth() + 1);
      }
    }

    return labels;
  }

  private bucketIndex(date: Date, from: Date, granularity: Granularity): number {
    if (granularity === "day") {
      return Math.floor((date.getTime() - from.getTime()) / 86_400_000);
    }
    const fromYear = from.getFullYear();
    const fromMonth = from.getMonth();
    return (date.getFullYear() - fromYear) * 12 + (date.getMonth() - fromMonth);
  }

  // ─── Content stats ─────────────────────────────────────────────────────────

  private async getContentStats({ from, to }: PeriodBounds) {
    const [
      totalTexts,
      publishedTexts,
      dictionaryWordsCount,
      readingsInPeriod,
      textsByLevel,
    ] = await Promise.all([
      this.prisma.text.count(),
      this.prisma.text.count({ where: { publishedAt: { not: null } } }),
      this.prisma.dictionaryEntry.count(),
      this.prisma.userEvent.count({
        where: { type: UserEventType.OPEN_TEXT, createdAt: { gte: from, lte: to } },
      }),
      this.prisma.text.groupBy({
        by: ["level"],
        _count: { id: true },
        where: { level: { not: null } },
      }),
    ]);

    return {
      totalTexts,
      publishedTexts,
      publishedPercent:
        totalTexts > 0 ? Math.round((publishedTexts / totalTexts) * 100) : 0,
      dictionaryWordsCount,
      readingsInPeriod,
      textsByLevel: textsByLevel.map((r) => ({ level: r.level, count: r._count.id })),
    };
  }

  // ─── Recent users ──────────────────────────────────────────────────────────

  private async getRecentUsers() {
    const users = await this.prisma.user.findMany({
      where: { status: { not: UserStatus.DELETED } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        name: true,
        surname: true,
        email: true,
        status: true,
        createdAt: true,
        subscriptions: {
          where: {
            status: {
              in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] as SubscriptionStatus[],
            },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            status: true,
            isLifetime: true,
            plan: { select: { type: true, name: true } },
          },
        },
      },
    });

    return users.map((u) => {
      const sub = u.subscriptions[0] ?? null;
      let subscriptionType: string | null = null;

      if (sub) {
        if (sub.status === SubscriptionStatus.TRIALING) {
          subscriptionType = "trial";
        } else if (sub.isLifetime) {
          subscriptionType = "lifetime";
        } else {
          subscriptionType = sub.plan.type.toLowerCase();
        }
      }

      return {
        id: u.id,
        name: u.name,
        surname: u.surname,
        email: u.email,
        status: u.status,
        subscriptionType,
        createdAt: u.createdAt,
      };
    });
  }

  // ─── Activity feed ─────────────────────────────────────────────────────────

  private async getActivityFeed() {
    const [texts, payments, feedbackNew, blockedUsers] = await Promise.all([
      this.prisma.text.findMany({
        where: { publishedAt: { not: null } },
        orderBy: { publishedAt: "desc" },
        take: 10,
        select: {
          title: true,
          publishedAt: true,
          createdBy: { select: { name: true, surname: true } },
        },
      }),
      this.prisma.payment.findMany({
        where: { status: PaymentStatus.SUCCEEDED },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          amountCents: true,
          currency: true,
          createdAt: true,
          user: { select: { name: true, surname: true } },
        },
      }),
      this.prisma.feedbackThread.findMany({
        where: { status: FeedbackStatus.NEW },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          createdAt: true,
          user: { select: { name: true, surname: true } },
        },
      }),
      this.prisma.user.findMany({
        where: { status: UserStatus.BLOCKED },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { name: true, surname: true, updatedAt: true },
      }),
    ]);

    type FeedEvent = { type: string; title: string; meta: string; createdAt: Date };
    const events: FeedEvent[] = [];

    for (const t of texts) {
      events.push({
        type: "TEXT_PUBLISHED",
        title: `Опубликован текст «${t.title}»`,
        meta: `Редактор: ${t.createdBy.name} ${t.createdBy.surname}`,
        createdAt: t.publishedAt!,
      });
    }

    for (const p of payments) {
      const amount = (p.amountCents / 100).toLocaleString("ru-RU");
      events.push({
        type: "PAYMENT",
        title: `Платёж ${p.currency} ${amount} от ${p.user.name[0]}. ${p.user.surname}`,
        meta: "Биллинг",
        createdAt: p.createdAt,
      });
    }

    for (const f of feedbackNew) {
      events.push({
        type: "FEEDBACK_NEW",
        title: `Новое обращение #${f.id.slice(-6).toUpperCase()}`,
        meta: `${f.user.name} ${f.user.surname} · Поддержка`,
        createdAt: f.createdAt,
      });
    }

    for (const u of blockedUsers) {
      events.push({
        type: "USER_BLOCKED",
        title: `Пользователь заблокирован`,
        meta: `${u.name} ${u.surname} · Модерация`,
        createdAt: u.updatedAt,
      });
    }

    return events
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 20);
  }

  // ─── Support summary ───────────────────────────────────────────────────────

  private async getSupportSummary() {
    const [byStatus, recentThreads] = await Promise.all([
      this.prisma.feedbackThread.groupBy({ by: ["status"], _count: true }),
      this.prisma.feedbackThread.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          type: true,
          status: true,
          createdAt: true,
          user: { select: { name: true, surname: true, email: true } },
          messages: {
            take: 1,
            orderBy: { createdAt: "asc" },
            select: { body: true },
          },
        },
      }),
    ]);

    const counts = Object.fromEntries(byStatus.map((r) => [r.status, r._count]));

    return {
      openCount: counts[FeedbackStatus.NEW] ?? 0,
      inProgressCount: counts[FeedbackStatus.IN_PROGRESS] ?? 0,
      answeredCount: counts[FeedbackStatus.ANSWERED] ?? 0,
      resolvedCount: counts[FeedbackStatus.RESOLVED] ?? 0,
      recentThreads: recentThreads.map((t) => ({
        id: t.id,
        type: t.type,
        status: t.status,
        subject: t.messages[0]?.body?.slice(0, 100) ?? null,
        userName: `${t.user.name} ${t.user.surname}`,
        userEmail: t.user.email,
        createdAt: t.createdAt,
      })),
    };
  }

  // ─── Unknown words summary ─────────────────────────────────────────────────

  private async getUnknownWordsSummary() {
    const total = await this.prisma.unknownWord.count();
    return { total };
  }

  // ─── Feature flags ─────────────────────────────────────────────────────────

  private async getFeatureFlags() {
    return this.prisma.featureFlag.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, key: true, description: true, isEnabled: true },
    });
  }

  // ─── Billing summary ───────────────────────────────────────────────────────

  private async getBillingSummary() {
    const [plans, activeSubsByPlan, recentPayments] = await Promise.all([
      this.prisma.plan.findMany({
        where: { isActive: true },
        orderBy: { priceCents: "asc" },
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
          priceCents: true,
          currency: true,
        },
      }),
      this.prisma.subscription.groupBy({
        by: ["planId"],
        where: {
          status: {
            in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] as SubscriptionStatus[],
          },
        },
        _count: true,
      }),
      this.prisma.payment.findMany({
        where: { status: PaymentStatus.SUCCEEDED },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          amountCents: true,
          currency: true,
          createdAt: true,
          user: { select: { name: true, surname: true } },
        },
      }),
    ]);

    const subCountByPlan = new Map(activeSubsByPlan.map((r) => [r.planId, r._count]));

    return {
      plans: plans.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        type: p.type,
        priceCents: p.priceCents,
        currency: p.currency,
        activeSubscriptions: subCountByPlan.get(p.id) ?? 0,
      })),
      recentPayments: recentPayments.map((p) => ({
        id: p.id,
        amountCents: p.amountCents,
        currency: p.currency,
        userName: `${p.user.name} ${p.user.surname}`,
        createdAt: p.createdAt,
      })),
    };
  }
}
