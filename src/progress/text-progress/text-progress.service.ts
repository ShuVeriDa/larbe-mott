import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";

@Injectable()
export class TextProgressService {
  constructor(private prisma: PrismaService) {}

  async calculateProgress(userId: string, textId: string) {
    const latestVersion = await this.prisma.textProcessingVersion.findFirst({
      where: { textId },
      orderBy: { version: "desc" },
      select: { id: true },
    });
    if (!latestVersion) return 0;

    const primaryAnalyses = await this.prisma.tokenAnalysis.findMany({
      where: {
        isPrimary: true,
        lemmaId: { not: null },
        token: { versionId: latestVersion.id },
      },
      select: { lemmaId: true },
    });
    const lemmaIds = new Set(
      primaryAnalyses
        .map((analysis) => analysis.lemmaId)
        .filter((lemmaId): lemmaId is string => lemmaId !== null),
    );

    const total = lemmaIds.size;

    const known = await this.prisma.userWordProgress.count({
      where: {
        userId,
        lemmaId: { in: [...lemmaIds] },
        status: "KNOWN",
      },
    });

    return total === 0 ? 0 : (known / total) * 100;
  }
}
