import { AnalyticsService } from "./analytics.service";

describe("AnalyticsService", () => {
  const prisma = {
    userNotificationPreferences: { findUnique: jest.fn() },
    userWordProgress: { groupBy: jest.fn(), count: jest.fn() },
    userTextProgress: { findMany: jest.fn() },
    userEvent: { findMany: jest.fn() },
  };

  let service: AnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AnalyticsService(prisma as never);
  });

  it("should calculate streak by user timezone offset", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-03-30T00:30:00.000Z"));

    prisma.userEvent.findMany
      .mockResolvedValueOnce([
        { createdAt: new Date("2026-03-29T22:30:00.000Z") }, // local UTC+3: 2026-03-30
        { createdAt: new Date("2026-03-28T22:30:00.000Z") }, // local UTC+3: 2026-03-29
      ])
      .mockResolvedValueOnce([
        { createdAt: new Date("2026-03-29T22:30:00.000Z") },
        { createdAt: new Date("2026-03-28T22:30:00.000Z") },
      ]);

    const result = await service.getStreakDetails("u1", 180);

    expect(result.current).toBe(2);
    expect(result.record).toBe(2);
    expect(prisma.userEvent.findMany).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });
});
