import { TextProgressService } from "./text-progress.service";

describe("TextProgressService", () => {
  const prisma = {
    textProcessingVersion: { findFirst: jest.fn() },
    tokenAnalysis: { findMany: jest.fn() },
    userWordProgress: { count: jest.fn() },
  };

  let service: TextProgressService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TextProgressService(prisma as never);
  });

  it("should return 0 when latest version does not exist", async () => {
    prisma.textProcessingVersion.findFirst.mockResolvedValue(null);

    await expect(service.calculateProgress("u1", "t1")).resolves.toBe(0);
    expect(prisma.tokenAnalysis.findMany).not.toHaveBeenCalled();
  });

  it("should calculate progress from latest version and primary analyses only", async () => {
    prisma.textProcessingVersion.findFirst.mockResolvedValue({ id: "v2" });
    prisma.tokenAnalysis.findMany.mockResolvedValue([
      { lemmaId: "l1" },
      { lemmaId: "l1" },
      { lemmaId: "l2" },
    ]);
    prisma.userWordProgress.count.mockResolvedValue(1);

    const progress = await service.calculateProgress("u1", "t1");

    expect(prisma.tokenAnalysis.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isPrimary: true,
          token: { versionId: "v2" },
        }),
      }),
    );
    expect(progress).toBe(50);
  });
});
