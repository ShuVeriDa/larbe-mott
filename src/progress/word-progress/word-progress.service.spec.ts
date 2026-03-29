import { WordProgressService } from "./word-progress.service";

describe("WordProgressService", () => {
  const prisma = {
    userWordProgress: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    wordContext: { count: jest.fn() },
  };

  let service: WordProgressService;

  beforeEach(() => {
    jest.clearAllMocks();
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
});
