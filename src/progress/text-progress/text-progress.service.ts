import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";

@Injectable()
export class TextProgressService {
  constructor(private prisma: PrismaService) {}

  async calculateProgress(userId: string, textId: string) {
    const tokens = await this.prisma.textToken.findMany({
      where: {
        version: { textId },
      },
      select: {
        analyses: {
          select: {
            lemmaId: true,
          },
        },
      },
    });

    const lemmaIds = new Set<string>();

    for (const token of tokens) {
      const lemma = token.analyses[0]?.lemmaId;
      if (lemma) lemmaIds.add(lemma);
    }

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
