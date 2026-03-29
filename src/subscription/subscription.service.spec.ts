import { BadRequestException, ConflictException } from "@nestjs/common";
import { PlanType } from "@prisma/client";
import { SubscriptionService } from "./subscription.service";

describe("SubscriptionService", () => {
  const prisma = {
    plan: { findUnique: jest.fn(), findMany: jest.fn() },
    subscription: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    payment: { create: jest.fn(), findMany: jest.fn() },
    userEvent: { count: jest.fn() },
    userDictionaryEntry: { count: jest.fn() },
    coupon: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    couponRedemption: { findFirst: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  };
  const configService = {
    get: jest.fn((key: string) => {
      if (key === "NODE_ENV") return "test";
      if (key === "ALLOW_MANUAL_BILLING_IN_PROD") return "false";
      if (key === "BILLING_PROVIDER") return "MANUAL";
      return undefined;
    }),
  };

  let service: SubscriptionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SubscriptionService(prisma as never, configService as never);
  });

  it("should reject subscription to FREE plan", async () => {
    prisma.plan.findUnique.mockResolvedValue({
      id: "p-free",
      isActive: true,
      type: PlanType.FREE,
    });

    await expect(service.subscribeToPlan("u1", "p-free")).rejects.toThrow(BadRequestException);
  });

  it("should reject when already subscribed to the same plan", async () => {
    prisma.plan.findUnique.mockResolvedValue({
      id: "p-pro",
      isActive: true,
      type: "PAID" as PlanType,
      priceCents: 1000,
    });
    jest
      .spyOn(service, "getMySubscription")
      .mockResolvedValue({ id: "s1", planId: "p-pro", plan: { priceCents: 1000 } } as never);

    await expect(service.subscribeToPlan("u1", "p-pro")).rejects.toThrow(ConflictException);
  });

  it("should return grouped and ungrouped active plans", async () => {
    prisma.plan.findMany.mockResolvedValue([
      { id: "1", groupCode: "pro", priceCents: 1000 },
      { id: "2", groupCode: "pro", priceCents: 9000 },
      { id: "3", groupCode: null, priceCents: 500 },
    ]);

    const result = await service.getActivePlans();

    expect(result.groups).toHaveLength(1);
    expect(result.ungrouped).toHaveLength(1);
  });

  it("should return guidance payload on promo redeem", async () => {
    prisma.coupon.findUnique.mockResolvedValue({
      id: "c1",
      code: "WELCOME",
      isActive: true,
      validFrom: null,
      validUntil: null,
      maxRedemptions: null,
      redeemedCount: 0,
      type: "PERCENT",
      amount: 20,
    });
    prisma.couponRedemption.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (cb: (tx: typeof prisma) => unknown) =>
      cb(prisma as never));
    prisma.coupon.updateMany.mockResolvedValue({ count: 1 });
    prisma.couponRedemption.create.mockResolvedValue({ id: "r1" });

    const result = await service.redeemCoupon("u1", "WELCOME");

    expect(result).toEqual({
      type: "PERCENT",
      amount: 20,
      appliesOn: "next_subscription_payment",
      requiresSubscriptionAction: true,
    });
  });
});
