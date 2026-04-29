import { PlanType } from "@prisma/client";
import { AdminBillingService } from "./admin-billing.service";

describe("AdminBillingService", () => {
  const prisma = {
    user: { count: jest.fn() },
    subscription: { findMany: jest.fn(), count: jest.fn() },
  };

  let service: AdminBillingService;

  beforeEach(() => {
    jest.clearAllMocks();
    const mail = { sendPaymentReceiptEmail: jest.fn() };
    service = new AdminBillingService(prisma as never, mail as never);
  });

  describe("getBillingStats", () => {
    // Calls inside Promise.all (порядок важен — мокаем по индексам):
    //   user.count        → totalUsers, newUsersLast30, newUsersPrev30
    //   subscription.findMany → activeSubsWithPlan, pastPayingSubsWithPlan
    //   subscription.count → canceledLast30, newPaidLast30, activeAtPeriodStart,
    //                        canceledPrev30, newPaidPrev30, activeAtPrevPeriodStart
    function setupMocks(opts: {
      totalUsers: number;
      activeSubsWithPlan: ReadonlyArray<{
        isLifetime: boolean;
        plan: { type: PlanType; priceCents: number; interval: string | null };
      }>;
      canceledLast30: number;
      newUsersLast30: number;
      newPaidLast30: number;
      activeAtPeriodStart: number;
      pastPayingSubsWithPlan: ReadonlyArray<{
        isLifetime: boolean;
        plan: { type: PlanType; priceCents: number; interval: string | null };
      }>;
      canceledPrev30: number;
      newUsersPrev30: number;
      newPaidPrev30: number;
      activeAtPrevPeriodStart: number;
    }) {
      prisma.user.count
        .mockResolvedValueOnce(opts.totalUsers as never)
        .mockResolvedValueOnce(opts.newUsersLast30 as never)
        .mockResolvedValueOnce(opts.newUsersPrev30 as never);

      prisma.subscription.findMany
        .mockResolvedValueOnce(opts.activeSubsWithPlan as never)
        .mockResolvedValueOnce(opts.pastPayingSubsWithPlan as never);

      prisma.subscription.count
        .mockResolvedValueOnce(opts.canceledLast30 as never)
        .mockResolvedValueOnce(opts.newPaidLast30 as never)
        .mockResolvedValueOnce(opts.activeAtPeriodStart as never)
        .mockResolvedValueOnce(opts.canceledPrev30 as never)
        .mockResolvedValueOnce(opts.newPaidPrev30 as never)
        .mockResolvedValueOnce(opts.activeAtPrevPeriodStart as never);
    }

    it("calculates churn against active subscriptions at period start", async () => {
      setupMocks({
        totalUsers: 100,
        activeSubsWithPlan: [
          {
            isLifetime: false,
            plan: { type: PlanType.PREMIUM, priceCents: 1000, interval: "month" },
          },
          {
            isLifetime: false,
            plan: { type: PlanType.PREMIUM, priceCents: 12000, interval: "year" },
          },
        ],
        canceledLast30: 4,
        newUsersLast30: 10,
        newPaidLast30: 5,
        activeAtPeriodStart: 20,
        pastPayingSubsWithPlan: [],
        canceledPrev30: 0,
        newUsersPrev30: 0,
        newPaidPrev30: 0,
        activeAtPrevPeriodStart: 0,
      });

      const stats = await service.getBillingStats();

      expect(stats.churnRate).toBe(20);
      expect(prisma.subscription.count).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          where: expect.objectContaining({
            startDate: expect.any(Object),
            plan: { type: { not: PlanType.FREE } },
          }),
        }),
      );
    });

    it("computes deltas vs previous 30-day window", async () => {
      setupMocks({
        totalUsers: 200,
        // Текущий MRR: 2 × monthly 1000 = 2000
        activeSubsWithPlan: [
          {
            isLifetime: false,
            plan: { type: PlanType.PRO, priceCents: 1000, interval: "month" },
          },
          {
            isLifetime: false,
            plan: { type: PlanType.PRO, priceCents: 1000, interval: "month" },
          },
        ],
        canceledLast30: 1,
        newUsersLast30: 50, // конверсия = 4 / 50 = 8%
        newPaidLast30: 4,
        activeAtPeriodStart: 10, // payingDelta = 2 - 10 = -8 (paying упало)
        // Прошлый MRR: 1 × monthly 1000 = 1000 → рост 100%
        pastPayingSubsWithPlan: [
          {
            isLifetime: false,
            plan: { type: PlanType.PRO, priceCents: 1000, interval: "month" },
          },
        ],
        canceledPrev30: 2,
        newUsersPrev30: 40, // прошлая конверсия = 2 / 40 = 5% → дельта +3 пп
        newPaidPrev30: 2,
        activeAtPrevPeriodStart: 20, // прошлый churn = 2 / 20 = 10%; текущий = 1 / 10 = 10% → дельта 0
      });

      const stats = await service.getBillingStats();

      expect(stats.payingCount).toBe(2);
      expect(stats.mrrCents).toBe(2000);
      expect(stats.payingDeltaLast30).toBe(-8);
      expect(stats.mrrGrowthPct).toBe(100);
      expect(stats.conversionDeltaPp).toBe(3);
      expect(stats.churnDeltaPp).toBe(0);
    });

    it("returns mrrGrowthPct=null when previous MRR is zero", async () => {
      setupMocks({
        totalUsers: 50,
        activeSubsWithPlan: [
          {
            isLifetime: false,
            plan: { type: PlanType.PRO, priceCents: 1000, interval: "month" },
          },
        ],
        canceledLast30: 0,
        newUsersLast30: 0,
        newPaidLast30: 0,
        activeAtPeriodStart: 0,
        pastPayingSubsWithPlan: [], // прошлый MRR = 0
        canceledPrev30: 0,
        newUsersPrev30: 0,
        newPaidPrev30: 0,
        activeAtPrevPeriodStart: 0,
      });

      const stats = await service.getBillingStats();

      expect(stats.mrrCents).toBe(1000);
      expect(stats.mrrGrowthPct).toBeNull();
    });
  });
});
