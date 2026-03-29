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
    service = new AdminBillingService(prisma as never);
  });

  it("should calculate churn against active subscriptions at period start", async () => {
    prisma.user.count
      .mockResolvedValueOnce(100 as never) // totalUsers
      .mockResolvedValueOnce(10 as never); // newUsersLast30

    prisma.subscription.findMany.mockResolvedValue([
      {
        isLifetime: false,
        plan: { type: PlanType.PREMIUM, priceCents: 1000, interval: "month" },
      },
      {
        isLifetime: false,
        plan: { type: PlanType.PREMIUM, priceCents: 12000, interval: "year" },
      },
    ] as never);

    prisma.subscription.count
      .mockResolvedValueOnce(4 as never) // canceledLast30
      .mockResolvedValueOnce(5 as never) // newPaidLast30
      .mockResolvedValueOnce(20 as never); // activeAtPeriodStart

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
});
