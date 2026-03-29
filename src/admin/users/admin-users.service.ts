import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  PlanType,
  RoleName,
  SubscriptionStatus,
  UserStatus,
} from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { AdminUserDetailsDto } from "./dto/admin-user-details.dto";
import { AdminUserListItemDto } from "./dto/admin-user-list-item.dto";
import { AdminUserStatusDto } from "./dto/admin-user-status.dto";
import { AdminUsersListResponseDto } from "./dto/admin-users-list-response.dto";
import { BulkUsersActionDto } from "./dto/bulk-users-action.dto";
import {
  FetchAdminUsersDto,
  UsersSort,
  UsersTab,
} from "./dto/fetch-admin-users.dto";
import { FetchUserEventsDto } from "./dto/fetch-user-events.dto";
import { FetchUserEventsSummaryDto } from "./dto/fetch-user-events-summary.dto";
import { ExtendSubscriptionDto } from "./dto/extend-subscription.dto";
import { SetFeatureFlagOverrideDto } from "./dto/set-feature-flag-override.dto";
import { ApplyCouponDto } from "./dto/apply-coupon.dto";
import { UserAnalyticsService } from "./user-analytics.service";

// Paid plan types for stats/filter
const PAID_PLAN_TYPES: PlanType[] = [
  PlanType.PRO,
  PlanType.PREMIUM,
  PlanType.LIFETIME,
];

const ACTIVE_SUB_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
];

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userAnalytics: UserAnalyticsService,
  ) {}

  // ─── Stats ───────────────────────────────────────────────────────────────────

  async getStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total, active, blocked, frozen, deleted, newThisMonth, withPaidSubscription] =
      await this.prisma.$transaction([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
        this.prisma.user.count({ where: { status: UserStatus.BLOCKED } }),
        this.prisma.user.count({ where: { status: UserStatus.FROZEN } }),
        this.prisma.user.count({ where: { status: UserStatus.DELETED } }),
        this.prisma.user.count({ where: { signupAt: { gte: startOfMonth } } }),
        this.prisma.user.count({
          where: {
            subscriptions: {
              some: {
                status: { in: ACTIVE_SUB_STATUSES },
                plan: { type: { in: PAID_PLAN_TYPES } },
              },
            },
          },
        }),
      ]);

    return {
      total,
      active,
      activePercent:
        total > 0 ? Math.round((active / total) * 1000) / 10 : 0,
      blocked,
      frozen,
      deleted,
      newThisMonth,
      withPaidSubscription,
    };
  }

  // ─── List ─────────────────────────────────────────────────────────────────────

  async getUsers(query: FetchAdminUsersDto): Promise<AdminUsersListResponseDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    const skip = (page - 1) * limit;

    // ── base filters (search / role / plan) — used for tab counts too ──────────
    const baseWhere: Prisma.UserWhereInput = {};

    if (query.q?.trim()) {
      const q = query.q.trim();
      baseWhere.OR = [
        { email: { contains: q, mode: "insensitive" } },
        { username: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { surname: { contains: q, mode: "insensitive" } },
        { id: { equals: q } },
      ];
    }
    if (query.email?.trim()) {
      baseWhere.email = { equals: query.email.trim(), mode: "insensitive" };
    }
    if (query.username?.trim()) {
      baseWhere.username = { equals: query.username.trim(), mode: "insensitive" };
    }
    if (query.id?.trim()) {
      baseWhere.id = { equals: query.id.trim() };
    }
    if (query.language) {
      baseWhere.language = { equals: query.language };
    }
    if (query.level) {
      baseWhere.level = { equals: query.level };
    }
    if (query.role) {
      baseWhere.roles = {
        some: { role: { name: { equals: query.role } } },
      };
    }
    if (query.plan === PlanType.FREE) {
      // FREE = no active non-free subscription
      baseWhere.subscriptions = {
        none: {
          status: { in: ACTIVE_SUB_STATUSES },
          plan: { type: { not: PlanType.FREE } },
        },
      };
    } else if (query.plan) {
      baseWhere.subscriptions = {
        some: {
          status: { in: ACTIVE_SUB_STATUSES },
          plan: { type: query.plan },
        },
      };
    }

    // ── status filter (tab overrides status param) ─────────────────────────────
    let statusWhere: Prisma.UserWhereInput = {
      status: { not: UserStatus.DELETED }, // default: hide deleted
    };

    if (query.tab) {
      switch (query.tab) {
        case UsersTab.ALL:
          statusWhere = {}; // include all
          break;
        case UsersTab.ACTIVE:
          statusWhere = { status: UserStatus.ACTIVE };
          break;
        case UsersTab.BLOCKED:
          statusWhere = { status: UserStatus.BLOCKED };
          break;
        case UsersTab.FROZEN:
          statusWhere = { status: UserStatus.FROZEN };
          break;
        case UsersTab.DELETED:
          statusWhere = { status: UserStatus.DELETED };
          break;
      }
    } else if (query.status) {
      statusWhere = { status: query.status };
    }

    const where: Prisma.UserWhereInput = { ...baseWhere, ...statusWhere };

    // ── sort ───────────────────────────────────────────────────────────────────
    let orderBy: Prisma.UserOrderByWithRelationInput;
    switch (query.sort) {
      case UsersSort.ACTIVITY_DESC:
        orderBy = { lastActiveAt: "desc" };
        break;
      case UsersSort.NAME_ASC:
        orderBy = { name: "asc" };
        break;
      default:
        orderBy = { signupAt: "desc" };
    }

    // ── queries ────────────────────────────────────────────────────────────────
    const [rawUsers, total, tabAll, tabActive, tabBlocked, tabFrozen, tabDeleted] =
      await Promise.all([
        this.prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy,
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            surname: true,
            status: true,
            language: true,
            level: true,
            lastActiveAt: true,
            signupAt: true,
            roles: {
              select: { role: { select: { name: true } } },
            },
            subscriptions: {
              where: { status: { in: ACTIVE_SUB_STATUSES } },
              select: { plan: { select: { type: true } } },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        }),
        this.prisma.user.count({ where }),
        this.prisma.user.count({ where: baseWhere }),
        this.prisma.user.count({ where: { ...baseWhere, status: UserStatus.ACTIVE } }),
        this.prisma.user.count({ where: { ...baseWhere, status: UserStatus.BLOCKED } }),
        this.prisma.user.count({ where: { ...baseWhere, status: UserStatus.FROZEN } }),
        this.prisma.user.count({ where: { ...baseWhere, status: UserStatus.DELETED } }),
      ]);

    const users = rawUsers.map((u) => ({
      id: u.id,
      email: u.email,
      username: u.username,
      name: u.name,
      surname: u.surname,
      status: u.status,
      language: u.language,
      level: u.level,
      lastActiveAt: u.lastActiveAt,
      signupAt: u.signupAt,
      roles: u.roles.map((r) => r.role.name),
      plan: u.subscriptions[0]?.plan?.type ?? null,
    }));

    return {
      users,
      total,
      page,
      limit,
      skip,
      tabs: {
        all: tabAll,
        active: tabActive,
        blocked: tabBlocked,
        frozen: tabFrozen,
        deleted: tabDeleted,
      },
    };
  }

  // ─── Single ───────────────────────────────────────────────────────────────────

  async getUserById(id: string): Promise<AdminUserDetailsDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        surname: true,
        phone: true,
        status: true,
        language: true,
        level: true,
        signupAt: true,
        lastActiveAt: true,
        roles: {
          select: {
            assignedAt: true,
            role: { select: { id: true, name: true } },
          },
        },
        subscriptions: {
          where: { status: { in: ACTIVE_SUB_STATUSES } },
          select: {
            id: true,
            status: true,
            startDate: true,
            endDate: true,
            canceledAt: true,
            isLifetime: true,
            provider: true,
            plan: {
              select: {
                name: true,
                type: true,
                priceCents: true,
                currency: true,
                interval: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!user) throw new NotFoundException("User not found");

    const { roles, subscriptions, ...rest } = user;

    const mappedRoles = roles.map((r) => ({
      id: r.role.id,
      name: r.role.name,
      assignedAt: r.assignedAt,
    }));

    const sub = subscriptions[0];
    const subscription = sub
      ? {
          id: sub.id,
          planType: sub.plan.type,
          planName: sub.plan.name,
          status: sub.status,
          startDate: sub.startDate,
          endDate: sub.endDate,
          canceledAt: sub.canceledAt,
          isLifetime: sub.isLifetime,
          priceCents: sub.plan.priceCents,
          currency: sub.plan.currency,
          interval: sub.plan.interval,
          provider: sub.provider,
        }
      : null;

    const learningStats = await this.userAnalytics.getUserLearningStats(id);

    return {
      ...rest,
      roles: mappedRoles,
      subscription,
      learningStats,
    };
  }

  // ─── Export ───────────────────────────────────────────────────────────────────

  async exportUsers(
    query: FetchAdminUsersDto,
  ): Promise<{ data: AdminUserListItemDto[] | string; format: "json" | "csv" }> {
    const result = await this.getUsers({
      ...query,
      page: 1,
      limit: 100, // service cap; we override below
    });

    // Fetch without pagination cap for export (max 10k)
    const page = 1;
    const limit = 10_000;
    const exportQuery: FetchAdminUsersDto = { ...query, page, limit };
    const fullResult = await this.getUsers(exportQuery);
    const users = fullResult.users;

    if (query.format === "csv") {
      const headers = [
        "id",
        "email",
        "name",
        "surname",
        "username",
        "status",
        "roles",
        "plan",
        "language",
        "level",
        "lastActiveAt",
        "signupAt",
      ];
      const escape = (v: unknown) =>
        `"${String(v ?? "").replace(/"/g, '""')}"`;
      const rows = users.map((u) =>
        [
          u.id,
          u.email,
          u.name,
          u.surname,
          u.username,
          u.status,
          u.roles.join(";"),
          u.plan ?? "FREE",
          u.language ?? "",
          u.level ?? "",
          u.lastActiveAt?.toISOString() ?? "",
          u.signupAt?.toISOString() ?? "",
        ]
          .map(escape)
          .join(","),
      );
      const csv = [headers.join(","), ...rows].join("\n");
      return { data: csv, format: "csv" };
    }

    return { data: users, format: "json" };
  }

  // ─── Status mutations ─────────────────────────────────────────────────────────

  async updateUserStatus(
    id: string,
    dto: AdminUserStatusDto,
  ): Promise<AdminUserDetailsDto> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("User not found");

    await this.prisma.user.update({
      where: { id },
      data: { status: dto.status, updatedAt: new Date() },
    });
    return this.getUserById(id);
  }

  async deleteUser(
    id: string,
    dto: AdminUserStatusDto,
  ): Promise<AdminUserDetailsDto> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("User not found");

    await this.prisma.user.update({
      where: { id },
      data: { status: dto.status, deletedAt: new Date(), updatedAt: new Date() },
    });
    return this.getUserById(id);
  }

  // ─── Bulk actions ─────────────────────────────────────────────────────────────

  async bulkFreeze(dto: BulkUsersActionDto) {
    const result = await this.prisma.user.updateMany({
      where: {
        id: { in: dto.ids },
        status: UserStatus.ACTIVE,
      },
      data: { status: UserStatus.FROZEN, updatedAt: new Date() },
    });
    return { updated: result.count };
  }

  async bulkBlock(dto: BulkUsersActionDto) {
    const result = await this.prisma.user.updateMany({
      where: {
        id: { in: dto.ids },
        status: { in: [UserStatus.ACTIVE, UserStatus.FROZEN] },
      },
      data: { status: UserStatus.BLOCKED, updatedAt: new Date() },
    });
    return { updated: result.count };
  }

  async bulkResetRoles(dto: BulkUsersActionDto) {
    const result = await this.prisma.userRoleAssignment.deleteMany({
      where: { userId: { in: dto.ids } },
    });
    return { deletedAssignments: result.count };
  }

  // ─── Sessions ─────────────────────────────────────────────────────────────────

  async logoutAllSessions(id: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("User not found");

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { hashedRefreshToken: null },
      }),
      this.prisma.userSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }

  // ─── Roles ────────────────────────────────────────────────────────────────────

  async getUserRoles(userId: string) {
    const rows = await this.prisma.userRoleAssignment.findMany({
      where: { userId },
      select: {
        assignedAt: true,
        role: { select: { id: true, name: true } },
      },
    });
    return rows.map((r) => ({ ...r.role, assignedAt: r.assignedAt }));
  }

  async assignRole(userId: string, role: RoleName, assignedBy?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    const roleRow = await this.prisma.role.findUnique({
      where: { name: role },
      select: { id: true },
    });
    if (!roleRow) throw new NotFoundException("Role not found");

    const existing = await this.prisma.userRoleAssignment.findUnique({
      where: { userId_roleId: { userId, roleId: roleRow.id } },
    });
    if (existing) throw new ConflictException("User already has this role");

    await this.prisma.userRoleAssignment.create({
      data: { userId, roleId: roleRow.id, assignedBy: assignedBy ?? null },
    });

    return this.getUserRoles(userId);
  }

  async revokeRole(userId: string, roleId: string) {
    const existing = await this.prisma.userRoleAssignment.findUnique({
      where: { userId_roleId: { userId, roleId } },
    });
    if (!existing) throw new NotFoundException("Role assignment not found");

    await this.prisma.userRoleAssignment.delete({
      where: { userId_roleId: { userId, roleId } },
    });
    return this.getUserRoles(userId);
  }

  // ─── Events ───────────────────────────────────────────────────────────────────

  async getUserEvents(userId: string, query: FetchUserEventsDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(200, Math.max(1, query.limit ?? 50));
    const skip = (page - 1) * limit;

    const where: Prisma.UserEventWhereInput = {
      userId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.userEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.userEvent.count({ where }),
    ]);

    return { items, total, page, limit, skip };
  }

  async getUserEventsSummary(userId: string, query: FetchUserEventsSummaryDto) {
    const where: Prisma.UserEventWhereInput = {
      userId,
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const events = await this.prisma.userEvent.findMany({
      where,
      select: { type: true, metadata: true },
    });

    const counts: Record<string, number> = {};
    const failByNormalized = new Map<string, number>();
    const clicksByNormalized = new Map<string, number>();

    for (const e of events) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
      const md = e.metadata as Record<string, unknown> | null;
      const normalized = md?.normalized;

      if (e.type === "FAIL_LOOKUP" && typeof normalized === "string") {
        failByNormalized.set(normalized, (failByNormalized.get(normalized) ?? 0) + 1);
      }
      if (e.type === "CLICK_WORD" && typeof normalized === "string") {
        clicksByNormalized.set(normalized, (clicksByNormalized.get(normalized) ?? 0) + 1);
      }
    }

    const topFailLookups = Array.from(failByNormalized.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([normalized, count]) => ({ normalized, count }));

    const topClicks = Array.from(clicksByNormalized.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([normalized, count]) => ({ normalized, count }));

    return {
      counts,
      clickWordCount: counts["CLICK_WORD"] ?? 0,
      dictionaryLookupFailedCount: counts["FAIL_LOOKUP"] ?? 0,
      topFailLookups,
      topClicks,
    };
  }

  // ─── Sessions ─────────────────────────────────────────────────────────────────

  async getUserSessions(userId: string) {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundException("User not found");

    const sessions = await this.prisma.userSession.findMany({
      where: { userId },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return sessions.map((s) => ({ ...s, isActive: s.revokedAt === null }));
  }

  // ─── Subscription ─────────────────────────────────────────────────────────────

  async getUserSubscription(userId: string) {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundException("User not found");

    const [currentSub, payments] = await Promise.all([
      this.prisma.subscription.findFirst({
        where: { userId, status: { in: ACTIVE_SUB_STATUSES } },
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
          canceledAt: true,
          isLifetime: true,
          provider: true,
          plan: {
            select: {
              name: true,
              type: true,
              priceCents: true,
              currency: true,
              interval: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.payment.findMany({
        where: { userId },
        select: {
          id: true,
          status: true,
          amountCents: true,
          refundedCents: true,
          currency: true,
          createdAt: true,
          subscription: {
            select: { plan: { select: { name: true, type: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    return {
      current: currentSub
        ? {
            id: currentSub.id,
            planType: currentSub.plan.type,
            planName: currentSub.plan.name,
            status: currentSub.status,
            startDate: currentSub.startDate,
            endDate: currentSub.endDate,
            canceledAt: currentSub.canceledAt,
            isLifetime: currentSub.isLifetime,
            priceCents: currentSub.plan.priceCents,
            currency: currentSub.plan.currency,
            interval: currentSub.plan.interval,
            provider: currentSub.provider,
          }
        : null,
      paymentHistory: payments.map((p) => ({
        id: p.id,
        status: p.status,
        amountCents: p.amountCents,
        refundedCents: p.refundedCents,
        currency: p.currency,
        createdAt: p.createdAt,
        planType: p.subscription?.plan?.type ?? null,
        planName: p.subscription?.plan?.name ?? null,
      })),
    };
  }

  async cancelSubscription(userId: string, subscriptionId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
    });
    if (!sub) throw new NotFoundException("Subscription not found");
    if (sub.status === SubscriptionStatus.CANCELED) {
      throw new ConflictException("Subscription is already canceled");
    }

    await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: SubscriptionStatus.CANCELED, canceledAt: new Date() },
    });

    return this.getUserSubscription(userId);
  }

  async extendSubscription(
    userId: string,
    subscriptionId: string,
    dto: ExtendSubscriptionDto,
  ) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
    });
    if (!sub) throw new NotFoundException("Subscription not found");

    const base = sub.endDate ?? new Date();
    const newEndDate = new Date(base.getTime() + dto.days * 24 * 60 * 60 * 1000);

    await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { endDate: newEndDate },
    });

    return this.getUserSubscription(userId);
  }

  // ─── Feature flags ────────────────────────────────────────────────────────────

  async getUserFeatureFlags(userId: string) {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundException("User not found");

    const [allFlags, userOverrides] = await Promise.all([
      this.prisma.featureFlag.findMany({ orderBy: { key: "asc" } }),
      this.prisma.userFeatureFlag.findMany({
        where: { userId },
        select: { featureFlagId: true, isEnabled: true },
      }),
    ]);

    const overrideMap = new Map(userOverrides.map((o) => [o.featureFlagId, o.isEnabled]));

    return allFlags.map((flag) => {
      const userOverride = overrideMap.has(flag.id) ? (overrideMap.get(flag.id) as boolean) : null;
      return {
        flagId: flag.id,
        key: flag.key,
        description: flag.description,
        globalValue: flag.isEnabled,
        userOverride,
        effectiveValue: userOverride !== null ? userOverride : flag.isEnabled,
      };
    });
  }

  async setFeatureFlagOverride(
    userId: string,
    flagId: string,
    dto: SetFeatureFlagOverrideDto,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    const flag = await this.prisma.featureFlag.findUnique({ where: { id: flagId } });
    if (!flag) throw new NotFoundException("Feature flag not found");

    await this.prisma.userFeatureFlag.upsert({
      where: { userId_featureFlagId: { userId, featureFlagId: flagId } },
      create: { userId, featureFlagId: flagId, isEnabled: dto.isEnabled },
      update: { isEnabled: dto.isEnabled },
    });

    return this.getUserFeatureFlags(userId);
  }

  async deleteFeatureFlagOverride(userId: string, flagId: string) {
    const override = await this.prisma.userFeatureFlag.findUnique({
      where: { userId_featureFlagId: { userId, featureFlagId: flagId } },
    });
    if (!override) throw new NotFoundException("Override not found");

    await this.prisma.userFeatureFlag.delete({
      where: { userId_featureFlagId: { userId, featureFlagId: flagId } },
    });

    return this.getUserFeatureFlags(userId);
  }

  // ─── Coupon ───────────────────────────────────────────────────────────────────

  async applyCoupon(userId: string, dto: ApplyCouponDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    const coupon = await this.prisma.coupon.findUnique({ where: { code: dto.code } });
    if (!coupon) throw new NotFoundException("Coupon not found");
    if (!coupon.isActive) throw new BadRequestException("Coupon is not active");

    const now = new Date();
    if (coupon.validFrom && coupon.validFrom > now) {
      throw new BadRequestException("Coupon is not yet valid");
    }
    if (coupon.validUntil && coupon.validUntil < now) {
      throw new BadRequestException("Coupon has expired");
    }
    if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) {
      throw new BadRequestException("Coupon redemption limit reached");
    }

    const existing = await this.prisma.couponRedemption.findFirst({
      where: { couponId: coupon.id, userId },
    });
    if (existing) throw new ConflictException("User has already redeemed this coupon");

    await this.prisma.$transaction([
      this.prisma.couponRedemption.create({
        data: { couponId: coupon.id, userId },
      }),
      this.prisma.coupon.update({
        where: { id: coupon.id },
        data: { redeemedCount: { increment: 1 } },
      }),
    ]);

    return { success: true, couponId: coupon.id, code: coupon.code };
  }
}
