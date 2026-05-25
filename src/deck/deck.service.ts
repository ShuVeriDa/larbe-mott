import { Injectable, NotFoundException } from "@nestjs/common";
import { DeckType, Prisma } from "@prisma/client";
import { ErrorCode } from "src/common/errors/error-codes";
import { PrismaService } from "src/prisma.service";
import { attachLatestContexts } from "src/progress/latest-context.helper";

const DEFAULT_DECK_LIMIT = 90;

const lemmaSelect = (userId: string) =>
  ({
    id: true,
    baseForm: true,
    partOfSpeech: true,
    headwords: {
      take: 3,
      orderBy: { order: "asc" },
      include: { entry: { select: { rawTranslate: true } } },
    },
    morphForms: {
      take: 8,
      orderBy: [{ gramCase: "asc" }, { gramNumber: "asc" }],
      select: { form: true, grammarTag: true, gramCase: true, gramNumber: true },
    },
    userDictionaryEntries: {
      where: { userId },
      select: { translation: true },
      take: 1,
    },
  }) satisfies Prisma.LemmaSelect;

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
      dailyNumberedDecks: state?.dailyNumberedDecks ?? 1,
    };
  }

  async updateSettings(
    userId: string,
    isEnabled?: boolean,
    dailyWordCount?: number,
    deckMaxSize?: number,
    dailyNumberedDecks?: number,
  ) {
    const data: {
      isEnabled?: boolean;
      dailyWordCount?: number;
      deckMaxSize?: number;
      dailyNumberedDecks?: number;
    } = {};
    if (isEnabled !== undefined) data.isEnabled = isEnabled;
    if (dailyWordCount !== undefined) data.dailyWordCount = dailyWordCount;
    if (deckMaxSize !== undefined) data.deckMaxSize = deckMaxSize;
    if (dailyNumberedDecks !== undefined) data.dailyNumberedDecks = dailyNumberedDecks;

    return this.prisma.userDeckState.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        currentNumberedDeck: 1,
        isEnabled: isEnabled ?? true,
        dailyWordCount: dailyWordCount ?? 5,
        deckMaxSize: deckMaxSize ?? DEFAULT_DECK_LIMIT,
        dailyNumberedDecks: dailyNumberedDecks ?? 1,
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
    if (!lemma) throw new NotFoundException({ code: ErrorCode.LEMMA_NOT_FOUND, message: "Lemma not found" });

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
    if (!existing) throw new NotFoundException({ code: ErrorCode.CARD_NOT_FOUND, message: "Card not found" });

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
    if (!card) throw new NotFoundException({ code: ErrorCode.CARD_NOT_FOUND, message: "Card not found" });

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

    // Exclude already-decked lemmas at the database level to avoid loading all rows into memory.
    const inDeck = await this.prisma.userDeckCard.findMany({
      where: { userId },
      select: { lemmaId: true },
    });
    const inDeckLemmaIds = inDeck
      .map((c) => c.lemmaId)
      .filter((id): id is string => id !== null);

    return this.prisma.userDictionaryEntry.findMany({
      where: {
        userId,
        lemmaId: { not: null, notIn: inDeckLemmaIds },
      },
      orderBy: { addedAt: "asc" },
      take: settings.dailyWordCount,
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
  }

  // ─── due cards ───────────────────────────────────────────────────────────────

  async getDueCards(userId: string) {
    const settings = await this.getSettings(userId);

    const [newCards, oldCards, retiredCards, repeatCards] = await Promise.all([
      this.prisma.userDeckCard.findMany({
        where: { userId, deckType: DeckType.NEW },
        include: { lemma: { select: lemmaSelect(userId) } },
        orderBy: { movedAt: "asc" },
      }),
      this.prisma.userDeckCard.findMany({
        where: { userId, deckType: DeckType.OLD },
        include: { lemma: { select: lemmaSelect(userId) } },
        orderBy: { movedAt: "asc" },
      }),
      this.prisma.userDeckCard.findMany({
        where: { userId, deckType: DeckType.RETIRED },
        include: { lemma: { select: lemmaSelect(userId) } },
        orderBy: { movedAt: "asc" },
      }),
      this.prisma.userDeckCard.findMany({
        where: { userId, deckType: DeckType.REPEAT },
        include: { lemma: { select: lemmaSelect(userId) } },
        orderBy: { movedAt: "asc" },
      }),
    ]);

    const maxResult = await this.prisma.userDeckCard.aggregate({
      where: { userId, deckType: DeckType.NUMBERED },
      _max: { deckNumber: true },
    });
    const maxDeck = maxResult._max.deckNumber ?? 0;

    // Collect cards for N numbered decks (dailyNumberedDecks setting)
    let numberedCards: typeof newCards = [];
    let currentNumberedDeck: number | null = null;
    const dailyN = settings.dailyNumberedDecks;

    if (maxDeck > 0) {
      currentNumberedDeck = await this.getCurrentNumberedDeck(userId, maxDeck);

      // Build list of N consecutive deck numbers (wrapping around maxDeck)
      const deckNumbers: number[] = [];
      for (let i = 0; i < dailyN; i++) {
        deckNumbers.push(((currentNumberedDeck - 1 + i) % maxDeck) + 1);
      }
      const uniqueDeckNumbers = [...new Set(deckNumbers)];

      numberedCards = await this.prisma.userDeckCard.findMany({
        where: { userId, deckType: DeckType.NUMBERED, deckNumber: { in: uniqueDeckNumbers } },
        include: { lemma: { select: lemmaSelect(userId) } },
        orderBy: [{ deckNumber: "asc" }, { movedAt: "asc" }],
      });
    }

    const [newWithCtx, oldWithCtx, retiredWithCtx, numberedWithCtx, repeatWithCtx] =
      await Promise.all([
        attachLatestContexts(this.prisma, userId, newCards),
        attachLatestContexts(this.prisma, userId, oldCards),
        attachLatestContexts(this.prisma, userId, retiredCards),
        attachLatestContexts(this.prisma, userId, numberedCards),
        attachLatestContexts(this.prisma, userId, repeatCards),
      ]);

    return {
      new: newWithCtx,
      old: oldWithCtx,
      retired: retiredWithCtx,
      numbered: numberedWithCtx,
      repeat: repeatWithCtx,
      currentNumberedDeck,
      maxNumberedDeck: maxDeck,
    };
  }

  // ─── stats ───────────────────────────────────────────────────────────────────

  async getStats(userId: string) {
    // Fetch settings and all card counts in parallel.
    const [state, newCount, oldCount, retiredCount, repeatCount, numberedGroups] =
      await Promise.all([
        this.prisma.userDeckState.findUnique({ where: { userId } }),
        this.prisma.userDeckCard.count({ where: { userId, deckType: DeckType.NEW } }),
        this.prisma.userDeckCard.count({ where: { userId, deckType: DeckType.OLD } }),
        this.prisma.userDeckCard.count({ where: { userId, deckType: DeckType.RETIRED } }),
        this.prisma.userDeckCard.count({ where: { userId, deckType: DeckType.REPEAT } }),
        this.prisma.userDeckCard.groupBy({
          by: ["deckNumber"],
          where: { userId, deckType: DeckType.NUMBERED },
          _count: { id: true },
          orderBy: { deckNumber: "asc" },
        }),
      ]);

    const settings = {
      isEnabled: state?.isEnabled ?? true,
      dailyWordCount: state?.dailyWordCount ?? 5,
      deckMaxSize: state?.deckMaxSize ?? DEFAULT_DECK_LIMIT,
      dailyNumberedDecks: state?.dailyNumberedDecks ?? 1,
    };

    const numberedTotal = numberedGroups.reduce((sum, g) => sum + g._count.id, 0);
    // Max numbered deck derived from groupBy result — no separate aggregate needed.
    const maxNumberedDeck =
      numberedGroups.length > 0
        ? Math.max(...numberedGroups.map((g) => g.deckNumber ?? 0))
        : 0;
    // Pass the already-fetched state to avoid an extra DB round-trip inside getCurrentNumberedDeck.
    const currentNumberedDeck =
      maxNumberedDeck > 0 ? await this.getCurrentNumberedDeck(userId, maxNumberedDeck, state) : null;

    return {
      new: newCount,
      old: oldCount,
      retired: retiredCount,
      repeat: repeatCount,
      numbered: numberedGroups.map((g) => ({ deckNumber: g.deckNumber, count: g._count.id })),
      total: newCount + oldCount + retiredCount + repeatCount + numberedTotal,
      currentNumberedDeck,
      maxNumberedDeck,
      deckMaxSize: settings.deckMaxSize,
      dailyWordCount: settings.dailyWordCount,
      dailyNumberedDecks: settings.dailyNumberedDecks,
    };
  }

  // ─── repeat deck ─────────────────────────────────────────────────────────────

  /**
   * Переместить карточку в REPEAT-колоду, запомнив откуда она пришла.
   * Карточка будет повторяться каждый день вместе с NEW/OLD/RETIRED.
   */
  async addToRepeat(userId: string, lemmaId: string) {
    const card = await this.prisma.userDeckCard.findUnique({
      where: { userId_lemmaId: { userId, lemmaId } },
    });
    if (!card) throw new NotFoundException({ code: ErrorCode.CARD_NOT_FOUND, message: "Card not found" });
    if (card.deckType === DeckType.REPEAT) return { ...card, shouldRefreshDeck: false };

    const updated = await this.prisma.userDeckCard.update({
      where: { userId_lemmaId: { userId, lemmaId } },
      data: {
        deckType: DeckType.REPEAT,
        originDeckType: card.deckType,
        originDeckNumber: card.deckNumber,
        movedAt: new Date(),
      },
    });
    return { ...updated, shouldRefreshDeck: true };
  }

  /**
   * Вернуть карточку из REPEAT обратно в исходную колоду.
   */
  async returnFromRepeat(userId: string, lemmaId: string) {
    const card = await this.prisma.userDeckCard.findUnique({
      where: { userId_lemmaId: { userId, lemmaId } },
    });
    if (!card) throw new NotFoundException({ code: ErrorCode.CARD_NOT_FOUND, message: "Card not found" });
    if (card.deckType !== DeckType.REPEAT) return { ...card, shouldRefreshDeck: false };

    const targetType = card.originDeckType ?? DeckType.NEW;
    const targetNumber = card.originDeckNumber ?? null;

    const updated = await this.prisma.userDeckCard.update({
      where: { userId_lemmaId: { userId, lemmaId } },
      data: {
        deckType: targetType,
        deckNumber: targetNumber,
        originDeckType: null,
        originDeckNumber: null,
        movedAt: new Date(),
      },
    });
    return { ...updated, shouldRefreshDeck: true };
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

  private async getCurrentNumberedDeck(
    userId: string,
    max: number,
    prefetchedState?: { currentNumberedDeck: number; lastRotatedAt: Date | null } | null,
  ): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const state = prefetchedState ?? await this.prisma.userDeckState.findUnique({ where: { userId } });

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
