import { Injectable, NotFoundException } from "@nestjs/common";
import { DeckType } from "@prisma/client";
import { PrismaService } from "src/prisma.service";

const DEFAULT_DECK_LIMIT = 90;

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

  // ─── settings ────────────────────────────────────────────────────────────────

  async getSettings(userId: string) {
    const state = await this.prisma.userDeckState.findUnique({ where: { userId } });
    return {
      isEnabled: state?.isEnabled ?? true,
      dailyWordCount: state?.dailyWordCount ?? 5,
      deckMaxSize: state?.deckMaxSize ?? DEFAULT_DECK_LIMIT,
    };
  }

  async updateSettings(userId: string, isEnabled?: boolean, dailyWordCount?: number, deckMaxSize?: number) {
    const data: { isEnabled?: boolean; dailyWordCount?: number; deckMaxSize?: number } = {};
    if (isEnabled !== undefined) data.isEnabled = isEnabled;
    if (dailyWordCount !== undefined) data.dailyWordCount = dailyWordCount;
    if (deckMaxSize !== undefined) data.deckMaxSize = deckMaxSize;

    return this.prisma.userDeckState.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        currentNumberedDeck: 1,
        isEnabled: isEnabled ?? true,
        dailyWordCount: dailyWordCount ?? 5,
        deckMaxSize: deckMaxSize ?? DEFAULT_DECK_LIMIT,
      },
    });
  }

  // ─── add / remove ────────────────────────────────────────────────────────────

  async addWord(userId: string, lemmaId: string) {
    const existing = await this.prisma.userDeckCard.findUnique({
      where: { userId_lemmaId: { userId, lemmaId } },
    });
    if (existing) return { ...existing, shouldRefreshDeck: false };

    const lemma = await this.prisma.lemma.findUnique({ where: { id: lemmaId } });
    if (!lemma) throw new NotFoundException("Lemma not found");

    const card = await this.prisma.userDeckCard.create({
      data: { userId, lemmaId, deckType: DeckType.NEW },
    });

    await this.rebalance(userId);
    return { ...card, shouldRefreshDeck: true };
  }

  async removeWord(userId: string, lemmaId: string) {
    const existing = await this.prisma.userDeckCard.findUnique({
      where: { userId_lemmaId: { userId, lemmaId } },
    });
    if (!existing) throw new NotFoundException("Card not found");

    const removed = await this.prisma.userDeckCard.delete({
      where: { userId_lemmaId: { userId, lemmaId } },
    });
    return { ...removed, shouldRefreshDeck: true };
  }

  // ─── rate card ────────────────────────────────────────────────────────────────

  /**
   * Оценить карточку после повторения.
   * 'know'  — слово знаю: обновляем movedAt чтобы карточка ушла в конец FIFO.
   * 'again' — не вспомнил: ничего не меняем, карточка остаётся на месте.
   */
  async rateCard(userId: string, lemmaId: string, result: "know" | "again") {
    const card = await this.prisma.userDeckCard.findUnique({
      where: { userId_lemmaId: { userId, lemmaId } },
    });
    if (!card) throw new NotFoundException("Card not found");

    if (result === "know") {
      const updated = await this.prisma.userDeckCard.update({
        where: { userId_lemmaId: { userId, lemmaId } },
        data: { movedAt: new Date() },
      });
      return { ...updated, shouldRefreshDeck: true };
    }

    return { ...card, shouldRefreshDeck: false };
  }

  // ─── daily words ─────────────────────────────────────────────────────────────

  /**
   * Возвращает N слов из словаря пользователя (UserDictionaryEntry),
   * которые ещё НЕ добавлены в деки. N берётся из настроек (dailyWordCount).
   */
  async getDailyWords(userId: string) {
    const settings = await this.getSettings(userId);

    const inDeck = await this.prisma.userDeckCard.findMany({
      where: { userId },
      select: { lemmaId: true },
    });
    const inDeckLemmaIds = new Set(
      inDeck.map((c) => c.lemmaId).filter((id): id is string => id !== null),
    );

    const entries = await this.prisma.userDictionaryEntry.findMany({
      where: { userId, lemmaId: { not: null } },
      orderBy: { addedAt: "asc" },
      select: {
        id: true,
        word: true,
        translation: true,
        lemmaId: true,
        addedAt: true,
        lemma: {
          select: { id: true, baseForm: true, partOfSpeech: true },
        },
      },
    });

    return entries
      .filter((e) => e.lemmaId && !inDeckLemmaIds.has(e.lemmaId))
      .slice(0, settings.dailyWordCount);
  }

  // ─── due cards ───────────────────────────────────────────────────────────────

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

  // ─── stats ───────────────────────────────────────────────────────────────────

  async getStats(userId: string) {
    const settings = await this.getSettings(userId);

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
      deckMaxSize: settings.deckMaxSize,
      dailyWordCount: settings.dailyWordCount,
    };
  }

  // ─── rebalance ────────────────────────────────────────────────────────────────

  private async rebalance(userId: string) {
    const settings = await this.getSettings(userId);
    const limit = settings.deckMaxSize;

    await this.rebalanceDeck(userId, DeckType.NEW, DeckType.OLD, limit);
    await this.rebalanceDeck(userId, DeckType.OLD, DeckType.RETIRED, limit);
    await this.rebalanceRetired(userId, limit);
  }

  private async rebalanceDeck(userId: string, from: DeckType, to: DeckType, limit: number) {
    const count = await this.prisma.userDeckCard.count({
      where: { userId, deckType: from },
    });
    if (count <= limit) return;

    const overflow = count - limit;
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

  private async rebalanceRetired(userId: string, limit: number) {
    const count = await this.prisma.userDeckCard.count({
      where: { userId, deckType: DeckType.RETIRED },
    });
    if (count <= limit) return;

    const overflow = count - limit;
    const [oldest, existingCounts] = await Promise.all([
      this.prisma.userDeckCard.findMany({
        where: { userId, deckType: DeckType.RETIRED },
        orderBy: { movedAt: "asc" },
        take: overflow,
        select: { id: true },
      }),
      this.prisma.userDeckCard.groupBy({
        by: ["deckNumber"],
        where: { userId, deckType: DeckType.NUMBERED },
        _count: { id: true },
      }),
    ]);

    // Pre-build count map so we can assign deck numbers without per-card queries
    const countByDeck = new Map<number, number>();
    for (const g of existingCounts) {
      if (g.deckNumber !== null) countByDeck.set(g.deckNumber, g._count.id);
    }

    // Assign cards to deck numbers, incrementing when a deck is full
    const byDeck = new Map<number, string[]>();
    let deckNumber = 1;
    for (const card of oldest) {
      while ((countByDeck.get(deckNumber) ?? 0) >= limit) deckNumber++;
      if (!byDeck.has(deckNumber)) byDeck.set(deckNumber, []);
      byDeck.get(deckNumber)!.push(card.id);
      countByDeck.set(deckNumber, (countByDeck.get(deckNumber) ?? 0) + 1);
    }

    // One updateMany per deck number instead of one update per card
    const now = new Date();
    await Promise.all(
      [...byDeck.entries()].map(([deck, ids]) =>
        this.prisma.userDeckCard.updateMany({
          where: { id: { in: ids } },
          data: { deckType: DeckType.NUMBERED, deckNumber: deck, movedAt: now },
        }),
      ),
    );
  }

  // ─── numbered deck rotation ───────────────────────────────────────────────────

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
