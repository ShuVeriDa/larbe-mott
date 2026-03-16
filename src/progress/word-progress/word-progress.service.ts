import { Injectable } from "@nestjs/common";
import { UserEventType } from "@prisma/client";
import { PrismaService } from "src/prisma.service";

@Injectable()
export class WordProgressService {
  constructor(private prisma: PrismaService) {}

  async registerClick(userId: string, lemmaId: string) {
    await this.prisma.userWordProgress.upsert({
      where: {
        userId_lemmaId: {
          userId,
          lemmaId,
        },
      },
      update: {
        repetitions: { increment: 1 },
        lastSeen: new Date(),
        status: "LEARNING",
      },
      create: {
        userId,
        lemmaId,
        repetitions: 1,
        status: "LEARNING",
        lastSeen: new Date(),
      },
    });

    await this.prisma.userEvent.create({
      data: {
        userId,
        type: UserEventType.CLICK_WORD,
        metadata: {
          lemmaId,
        },
      },
    });
  }

  async registerSeenWords(userId: string, lemmaIds: string[]) {
    const unique = [...new Set(lemmaIds)];
    const now = new Date();

    await this.prisma.userWordProgress.createMany({
      data: unique.map((lemmaId) => ({
        userId,
        lemmaId,
        lastSeen: now,
      })),
      skipDuplicates: true,
    });

    await this.prisma.userWordProgress.updateMany({
      where: {
        userId,
        lemmaId: { in: unique },
      },
      data: {
        lastSeen: now,
      },
    });
  }
}
