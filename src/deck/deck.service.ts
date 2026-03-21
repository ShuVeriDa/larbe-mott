import { Injectable, NotFoundException } from "@nestjs/common";
import { DeckType } from "@prisma/client";
import { PrismaService } from "src/prisma.service";

const DECK_LIMIT = 90;

const lemmaSelect = {
  id: true,
  baseForm: true,
  partOfSpeech: true,
  headwords: {
    take: 1,
    include: { entry: { select: { rawTranslate: true } } },
  },
};

@Injectable()
export class DeckService {
  constructor(private prisma: PrismaService) {}

  async addWord(userId: string, lemmaId: string) {
    const existing = await this.prisma.userDeckCard.findUnique({
      where: { userId_lemmaId: { userId, lemmaId } },
    });
    if (existing) return existing;

    const lemma = await this.prisma.lemma.findUnique({ where: { id: lemmaId } });
    if (!lemma) throw new NotFoundException("Lemma not found");

    const card = await this.prisma.userDeckCard.create({
      data: { userId, lemmaId, deckType: DeckType.NEW },
    });

    await this.rebalance(userId);
    return card;
  }

  async removeWord(userId: string, lemmaId: string) {
    const existing = await this.prisma.userDeckCard.findUnique({
      where: { userId_lemmaId: { userId, lemmaId } },
    });
    if (!existing) throw new NotFoundException("Card not found");

    return this.prisma.userDeckCard.delete({
      where: { userId_lemmaId: { userId, lemmaId } },
    });
  }

  async getDueCards(userId: string) {
    const [newCards, oldCards, retiredCards] = await Promise.all([
      this.prisma.userDeckCard.findMany({
        where: { userId, deckType: DeckType.NEW },
        include: { lemma: { select: lemmaSelect } },
        orderBy: { movedAt: "asc" },
      }),
      this.prisma.userDeckCard.findMany({
        where: { userId, deckType: DeckType.OLD },
        include: { lemma: { select: lemmaSelect } },
        orderBy: { movedAt: "asc" },
      }),
      this.prisma.userDeckCard.findMany({
        where: { userId, deckType: DeckType.RETIRED },
        include: { lemma: { select: lemmaSelect } },
        orderBy: { movedAt: "asc" },
      }),
    ]);

    const maxResult = await this.prisma.userDeckCard.aggregate({
      where: { userId, deckType: DeckType.NUMBERED },
      _max: { deckNumber: true },
    });
    const maxDeck = maxResult._max.deckNumber ?? 0;

    let numberedCards: typeof newCards = [];
    let currentNumberedDeck: number | null = null;

    if (maxDeck > 0) {
      currentNumberedDeck = await this.getCurrentNumberedDeck(userId, maxDeck);
      numberedCards = await this.prisma.userDeckCard.findMany({
        where: { userId, deckType: DeckType.NUMBERED, deckNumber: currentNumberedDeck },
        include: { lemma: { select: lemmaSelect } },
        orderBy: { movedAt: "asc" },
      });
    }

    return {
      new: newCards,
      old: oldCards,
      retired: retiredCards,
      numbered: numberedCards,
      currentNumberedDeck,
      maxNumberedDeck: maxDeck,
    };
  }

  async getStats(userId: string) {
    const [newCount, oldCount, retiredCount, numberedGroups] = await Promise.all([
      this.prisma.userDeckCard.count({ where: { userId, deckType: DeckType.NEW } }),
      this.prisma.userDeckCard.count({ where: { userId, deckType: DeckType.OLD } }),
      this.prisma.userDeckCard.count({ where: { userId, deckType: DeckType.RETIRED } }),
      this.prisma.userDeckCard.groupBy({
        by: ["deckNumber"],
        where: { userId, deckType: DeckType.NUMBERED },
        _count: { id: true },
        orderBy: { deckNumber: "asc" },
      }),
    ]);

    const numberedTotal = numberedGroups.reduce((sum, g) => sum + g._count.id, 0);

    return {
      new: newCount,
      old: oldCount,
      retired: retiredCount,
      numbered: numberedGroups.map((g) => ({ deckNumber: g.deckNumber, count: g._count.id })),
      total: newCount + oldCount + retiredCount + numberedTotal,
    };
  }

  private async rebalance(userId: string) {
    await this.rebalanceDeck(userId, DeckType.NEW, DeckType.OLD);
    await this.rebalanceDeck(userId, DeckType.OLD, DeckType.RETIRED);
    await this.rebalanceRetired(userId);
  }

  private async rebalanceDeck(userId: string, from: DeckType, to: DeckType) {
    const count = await this.prisma.userDeckCard.count({
      where: { userId, deckType: from },
    });
    if (count <= DECK_LIMIT) return;

    const overflow = count - DECK_LIMIT;
    const oldest = await this.prisma.userDeckCard.findMany({
      where: { userId, deckType: from },
      orderBy: { movedAt: "asc" },
      take: overflow,
      select: { id: true },
    });

    await this.prisma.userDeckCard.updateMany({
      where: { id: { in: oldest.map((c) => c.id) } },
      data: { deckType: to, movedAt: new Date() },
    });
  }

  private async rebalanceRetired(userId: string) {
    const count = await this.prisma.userDeckCard.count({
      where: { userId, deckType: DeckType.RETIRED },
    });
    if (count <= DECK_LIMIT) return;

    const overflow = count - DECK_LIMIT;
    const oldest = await this.prisma.userDeckCard.findMany({
      where: { userId, deckType: DeckType.RETIRED },
      orderBy: { movedAt: "asc" },
      take: overflow,
      select: { id: true },
    });

    let deckNumber = 1;
    for (const card of oldest) {
      const deckCount = await this.prisma.userDeckCard.count({
        where: { userId, deckType: DeckType.NUMBERED, deckNumber },
      });
      if (deckCount >= DECK_LIMIT) deckNumber++;

      await this.prisma.userDeckCard.update({
        where: { id: card.id },
        data: { deckType: DeckType.NUMBERED, deckNumber, movedAt: new Date() },
      });
    }
  }

  private async getCurrentNumberedDeck(userId: string, max: number): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const state = await this.prisma.userDeckState.findUnique({ where: { userId } });

    if (!state) {
      await this.prisma.userDeckState.create({
        data: { userId, currentNumberedDeck: 1, lastRotatedAt: today },
      });
      return 1;
    }

    if (state.lastRotatedAt) {
      const lastDate = new Date(state.lastRotatedAt);
      lastDate.setHours(0, 0, 0, 0);
      if (lastDate.getTime() === today.getTime()) {
        return Math.min(state.currentNumberedDeck, max);
      }
    }

    const next = (state.currentNumberedDeck % max) + 1;
    await this.prisma.userDeckState.update({
      where: { userId },
      data: { currentNumberedDeck: next, lastRotatedAt: today },
    });
    return next;
  }
}
