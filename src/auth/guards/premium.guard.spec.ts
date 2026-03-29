import { SubscriptionStatus } from "@prisma/client";
import { PremiumGuard } from "./premium.guard";

describe("PremiumGuard", () => {
  const prisma = {
    userRoleAssignment: { findFirst: jest.fn() },
    subscription: { findFirst: jest.fn() },
  };
  const redis = {
    get: jest.fn(),
    set: jest.fn(),
  };

  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ user: { id: "u1" } }),
    }),
  };

  let guard: PremiumGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new PremiumGuard(prisma as never, redis as never);
  });

  it("should cache active premium status and use cache on next request", async () => {
    redis.get.mockResolvedValueOnce(null).mockResolvedValueOnce("active");
    prisma.userRoleAssignment.findFirst.mockResolvedValue(null);
    prisma.subscription.findFirst.mockResolvedValue({ status: SubscriptionStatus.ACTIVE });

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    await expect(guard.canActivate(context as never)).resolves.toBe(true);

    expect(redis.set).toHaveBeenCalledWith("premium:u1", "active", "EX", 300);
    expect(prisma.subscription.findFirst).toHaveBeenCalledTimes(1);
  });
});
