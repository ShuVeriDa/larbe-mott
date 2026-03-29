import { WordProgressService } from "./word-progress.service";

describe("WordProgressService", () => {
  const prisma = {
    $transaction: jest.fn(),
    userWordProgress: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    wordContext: { count: jest.fn() },
    tokenAnalysis: { findMany: jest.fn() },
    userTextProgress: { findMany: jest.fn() },
    textProcessingVersion: { findMany: jest.fn() },
  };

  let service: WordProgressService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (cb: (tx: typeof prisma) => unknown) => cb(prisma as never));
    prisma.tokenAnalysis.findMany.mockResolvedValue([]);
    service = new WordProgressService(prisma as never);
  });

  it("should apply SM-2 and keep LEARNING for short interval", async () => {
    prisma.userWordProgress.findUnique.mockResolvedValue({
      repetitions: 1,
      easeFactor: 2.5,
      interval: 6,
    });
    prisma.wordContext.count.mockResolvedValue(0);
    prisma.userWordProgress.upsert.mockResolvedValue({ status: "LEARNING", interval: 15 });

    await service.submitReview("u1", "l1", 4);

    expect(prisma.userWordProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: "LEARNING",
        }),
      }),
    );
  });

  it("should fetch due words excluding KNOWN status", async () => {
    prisma.userWordProgress.findMany.mockResolvedValue([]);

    await service.getDueWords("u1", 20);

    expect(prisma.userWordProgress.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "u1",
          status: { not: "KNOWN" },
        }),
        take: 20,
      }),
    );
  });

  it("should set KNOWN when interval reaches known threshold", async () => {
    prisma.userWordProgress.findUnique.mockResolvedValue({
      repetitions: 2,
      easeFactor: 2.5,
      interval: 10,
    });
    prisma.wordContext.count.mockResolvedValue(0);
    prisma.userWordProgress.upsert.mockResolvedValue({ status: "KNOWN", interval: 25 });

    await service.submitReview("u1", "l1", 5);

    expect(prisma.userWordProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: "KNOWN",
          interval: expect.any(Number),
        }),
      }),
    );
  });

  it("should reset SM-2 fields when setting LEARNING status manually", async () => {
    prisma.userWordProgress.upsert.mockResolvedValue({ status: "LEARNING", repetitions: 0, interval: 0 });

    await service.setWordStatus("u1", "l1", "LEARNING");

    expect(prisma.userWordProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: "LEARNING",
          repetitions: 0,
          interval: 0,
          easeFactor: 2.5,
        }),
      }),
    );
  });
});
