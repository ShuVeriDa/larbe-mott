import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, SubscriptionStatus, UserEventType } from "@prisma/client";
import { normalizeToken } from "src/markup-engine/tokenizer/tokenizer.utils";
import { PrismaService } from "src/prisma.service";
import { TokenService } from "src/token/token.service";
import { WordProgressService } from "src/progress/word-progress/word-progress.service";
import { ErrorCode } from "src/common/errors/error-codes";
import { CreateDictionaryEntryDto } from "./dto/create-dictionary-entry.dto";
import { DictionarySort, GetDictionaryEntriesDto } from "./dto/get-dictionary-entries.dto";
import { UpdateDictionaryEntryDto } from "./dto/update-dictionary-entry.dto";

// Mastery 0..100 derived from SM-2 state. Mirrors WordProgressService.KNOWN_INTERVAL = 21.
const KNOWN_INTERVAL = 21;
// Сколько успешных повторений нужно (приблизительно), чтобы интервал достиг KNOWN.
// SM-2 при easeFactor=2.5: 1, 6, 15, 37 → 4-е повторение уводит в KNOWN. Округляем вверх.
const TARGET_REPETITIONS = 4;

function computeProgressPercent(
  learningLevel: string,
  progressStatus: string | null,
  interval: number,
): number {
  if (learningLevel === "KNOWN" || progressStatus === "KNOWN") return 100;
  if (interval <= 0) return 0;
  return Math.min(100, Math.round((interval / KNOWN_INTERVAL) * 100));
}

const CASE_LABEL_RU: Record<string, string> = {
  NOM: "Именительный",
  GEN: "Родительный",
  DAT: "Дательный",
  ERG: "Эргативный",
  INS: "Творительный",
  LOC: "Местный",
  ALL: "Направительный",
};

@Injectable()
export class DictionaryService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly tokenService: TokenService,
    private readonly wordProgressService: WordProgressService,
  ) {}

  async getUserDictionaryEntries(userId: string, query: GetDictionaryEntriesDto = {}) {
    const {
      status,
      cefrLevel,
      folderId,
      noFolder,
      sort = DictionarySort.ADDED,
      page = 1,
      limit = 20,
      search,
    } = query;

    const where: Prisma.UserDictionaryEntryWhereInput = { userId };
    if (status) where.learningLevel = status;
    if (cefrLevel) where.cefrLevel = cefrLevel;
    if (noFolder) {
      where.folderId = null;
    } else if (folderId) {
      where.folderId = folderId;
    }
    const trimmed = search?.trim();
    if (trimmed) {
      const normalized = normalizeToken(trimmed);
      where.OR = [
        { word: { contains: trimmed, mode: "insensitive" } },
        { translation: { contains: trimmed, mode: "insensitive" } },
        ...(normalized
          ? [{ normalized: { contains: normalized } as Prisma.StringNullableFilter }]
          : []),
      ];
    }

    const orderBy = this.buildOrderBy(sort);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const safePage = Math.max(1, page);
    const skip = (safePage - 1) * safeLimit;

    const [entries, total] = await Promise.all([
      this.prismaService.userDictionaryEntry.findMany({
        where,
        orderBy,
        skip,
        take: safeLimit,
        include: {
          folder: { select: { id: true, name: true } },
          lemma: {
            select: {
              id: true,
              baseForm: true,
              partOfSpeech: true,
              morphForms: { select: { form: true, grammarTag: true } },
              headwords: {
                select: {
                  entry: {
                    select: {
                      senses: {
                        orderBy: { order: "asc" },
                        take: 3,
                        select: {
                          definition: true,
                          examples: {
                            take: 2,
                            select: { text: true, translation: true },
                          },
                        },
                      },
                    },
                  },
                },
              },
              wordContexts: {
                where: { userId },
                take: 1,
                orderBy: { seenAt: "desc" },
                select: {
                  textId: true,
                  snippet: true,
                  text: { select: { title: true } },
                },
              },
            },
          },
        },
      }),
      this.prismaService.userDictionaryEntry.count({ where }),
    ]);

    // Attach nextReview from UserWordProgress for entries that have a lemmaId
    const lemmaIds = entries
      .map((e) => e.lemmaId)
      .filter((id): id is string => id !== null);

    const progressMap = new Map<
      string,
      { nextReview: Date | null; status: string; interval: number }
    >();
    if (lemmaIds.length > 0) {
      const progresses = await this.prismaService.userWordProgress.findMany({
        where: { userId, lemmaId: { in: lemmaIds } },
        select: { lemmaId: true, nextReview: true, status: true, interval: true },
      });
      for (const p of progresses) {
        progressMap.set(p.lemmaId, {
          nextReview: p.nextReview,
          status: p.status,
          interval: p.interval,
        });
      }
    }

    const mapped = entries.map((entry) => {
      const progress = entry.lemmaId ? progressMap.get(entry.lemmaId) : null;
      return {
        ...entry,
        nextReview: progress?.nextReview ?? null,
        wordProgressStatus: progress?.status ?? null,
        progressPercent: computeProgressPercent(
          entry.learningLevel,
          progress?.status ?? null,
          progress?.interval ?? 0,
        ),
      };
    });

    if (sort === DictionarySort.REVIEW) {
      mapped.sort((a, b) => {
        if (!a.nextReview && !b.nextReview) return 0;
        if (!a.nextReview) return 1;
        if (!b.nextReview) return -1;
        return a.nextReview.getTime() - b.nextReview.getTime();
      });
    } else if (sort === DictionarySort.STATUS) {
      const priority: Record<string, number> = { NEW: 0, LEARNING: 1, KNOWN: 2 };
      mapped.sort(
        (a, b) =>
          (priority[a.learningLevel] ?? 0) - (priority[b.learningLevel] ?? 0),
      );
    }

    return { items: mapped, total, page: safePage, limit: safeLimit };
  }

  private buildOrderBy(
    sort: DictionarySort,
  ): Prisma.UserDictionaryEntryOrderByWithRelationInput {
    switch (sort) {
      case DictionarySort.ALPHA:
        return { word: "asc" };
      case DictionarySort.REVIEW:
      case DictionarySort.STATUS:
      case DictionarySort.ADDED:
      default:
        return { addedAt: "desc" };
    }
  }

  async getUserDictionaryEntry(id: string, userId: string) {
    const entry = await this.prismaService.userDictionaryEntry.findUnique({
      where: { id },
    });
    if (!entry || entry.userId !== userId) {
      throw new NotFoundException({ code: ErrorCode.DICTIONARY_ENTRY_NOT_FOUND, message: "Dictionary entry not found" });
    }
    return entry;
  }

  async getUserDictionaryEntryDetail(id: string, userId: string) {
    const entry = await this.prismaService.userDictionaryEntry.findUnique({
      where: { id },
      include: {
        folder: { select: { id: true, name: true, color: true } },
        lemma: {
          select: {
            id: true,
            baseForm: true,
            partOfSpeech: true,
            frequency: true,
            transliteration: true,
            audioUrl: true,
            declensionClass: true,
            morphForms: {
              select: {
                form: true,
                grammarTag: true,
                translation: true,
                gramCase: true,
                gramNumber: true,
              },
              orderBy: { form: "asc" },
            },
            headwords: {
              select: {
                entry: {
                  select: {
                    senses: {
                      orderBy: { order: "asc" },
                      select: {
                        id: true,
                        definition: true,
                        notes: true,
                        examples: {
                          select: {
                            id: true,
                            text: true,
                            translation: true,
                            sourceText: true,
                            sourceTextId: true,
                            source: { select: { id: true, title: true } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            wordContexts: {
              where: { userId },
              orderBy: { seenAt: "desc" },
              take: 5,
              select: {
                id: true,
                snippet: true,
                seenAt: true,
                text: {
                  select: { id: true, title: true, level: true },
                },
              },
            },
            relations: {
              select: {
                type: true,
                related: {
                  select: {
                    id: true,
                    baseForm: true,
                    transliteration: true,
                    level: true,
                  },
                },
              },
              take: 12,
            },
          },
        },
      },
    });

    if (!entry || entry.userId !== userId) {
      throw new NotFoundException({ code: ErrorCode.DICTIONARY_ENTRY_NOT_FOUND, message: "Dictionary entry not found" });
    }

    // SM-2 progress
    const progress = entry.lemmaId
      ? await this.prismaService.userWordProgress.findUnique({
          where: { userId_lemmaId: { userId, lemmaId: entry.lemmaId } },
          select: {
            status: true,
            seenCount: true,
            repetitions: true,
            lastSeen: true,
            nextReview: true,
            easeFactor: true,
            interval: true,
          },
        })
      : null;

    // Review history (last 10) + success count
    const reviewLogs = entry.lemmaId
      ? await this.prismaService.userReviewLog.findMany({
          where: { userId, lemmaId: entry.lemmaId },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            quality: true,
            correct: true,
            intervalBefore: true,
            intervalAfter: true,
            createdAt: true,
          },
        })
      : [];

    const successCount = reviewLogs.filter((r) => r.correct).length;
    const logsWithDelta = reviewLogs.map((log) => {
      const before = log.intervalBefore;
      const after = log.intervalAfter;
      const delta = before !== null && after !== null ? after - before : null;
      return { ...log, intervalDelta: delta };
    });

    // Flatten senses from all headwords (deduplicate by id) and translate examples
    const seenSenseIds = new Set<string>();
    type SenseOut = {
      id: string;
      definition: string;
      notes: string | null;
      examples: {
        id: string;
        text: string;
        translation: string | null;
        origin: string | null;
        sourceTextId: string | null;
      }[];
    };
    const senses: SenseOut[] = [];
    for (const hw of entry.lemma?.headwords ?? []) {
      for (const sense of hw.entry.senses) {
        if (seenSenseIds.has(sense.id)) continue;
        seenSenseIds.add(sense.id);
        senses.push({
          id: sense.id,
          definition: sense.definition,
          notes: sense.notes,
          examples: sense.examples.map((ex) => ({
            id: ex.id,
            text: ex.text,
            translation: ex.translation,
            origin: ex.source?.title ?? ex.sourceText ?? null,
            sourceTextId: ex.sourceTextId,
          })),
        });
      }
    }

    const morphForms =
      entry.lemma?.morphForms.map((m) => ({
        form: m.form,
        grammarTag: m.grammarTag,
        translation: m.translation,
        gramCase: m.gramCase,
        gramNumber: m.gramNumber,
        caseLabel: m.gramCase ? (CASE_LABEL_RU[m.gramCase] ?? null) : null,
      })) ?? [];

    const related =
      entry.lemma?.relations.map((rel) => ({
        type: rel.type,
        lemmaId: rel.related.id,
        baseForm: rel.related.baseForm,
        transliteration: rel.related.transliteration,
        level: rel.related.level,
      })) ?? [];

    return {
      id: entry.id,
      word: entry.word,
      translation: entry.translation,
      normalized: entry.normalized,
      learningLevel: progress?.status ?? entry.learningLevel,
      cefrLevel: entry.cefrLevel,
      addedAt: entry.addedAt,
      folder: entry.folder ?? null,
      lemma: entry.lemma
        ? {
            id: entry.lemma.id,
            baseForm: entry.lemma.baseForm,
            partOfSpeech: entry.lemma.partOfSpeech,
            frequency: entry.lemma.frequency,
            transliteration: entry.lemma.transliteration,
            audioUrl: entry.lemma.audioUrl,
            declensionClass: entry.lemma.declensionClass,
            morphForms,
            wordContexts: entry.lemma.wordContexts,
          }
        : null,
      senses,
      related,
      sm2: progress
        ? { ...progress, targetRepetitions: TARGET_REPETITIONS }
        : null,
      progressPercent: computeProgressPercent(
        entry.learningLevel,
        progress?.status ?? null,
        progress?.interval ?? 0,
      ),
      reviewHistory: {
        totalReviews: reviewLogs.length,
        successCount,
        logs: logsWithDelta,
      },
    };
  }

  // Возвращает соседние записи словаря в текущем фильтре/сортировке.
  // Используется для кнопок prev/next в карточке слова.
  async getUserDictionaryEntryNeighbors(
    id: string,
    userId: string,
    query: GetDictionaryEntriesDto = {},
  ) {
    const current = await this.prismaService.userDictionaryEntry.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!current || current.userId !== userId) {
      throw new NotFoundException({ code: ErrorCode.DICTIONARY_ENTRY_NOT_FOUND, message: "Dictionary entry not found" });
    }

    const { status, cefrLevel, folderId, noFolder, sort = DictionarySort.ADDED, search } = query;
    const where: Prisma.UserDictionaryEntryWhereInput = { userId };
    if (status) where.learningLevel = status;
    if (cefrLevel) where.cefrLevel = cefrLevel;
    if (noFolder) where.folderId = null;
    else if (folderId) where.folderId = folderId;
    const trimmed = search?.trim();
    if (trimmed) {
      const normalized = normalizeToken(trimmed);
      where.OR = [
        { word: { contains: trimmed, mode: "insensitive" } },
        { translation: { contains: trimmed, mode: "insensitive" } },
        ...(normalized
          ? [{ normalized: { contains: normalized } as Prisma.StringNullableFilter }]
          : []),
      ];
    }

    // Загружаем минимальный список и считаем индекс. Для REVIEW/STATUS Prisma не умеет
    // сортировать по полям UserWordProgress, поэтому повторяем логику из getUserDictionaryEntries.
    const entries = await this.prismaService.userDictionaryEntry.findMany({
      where,
      orderBy: this.buildOrderBy(sort),
      select: { id: true, word: true, lemmaId: true, learningLevel: true },
    });

    let ordered = entries;
    if (sort === DictionarySort.REVIEW || sort === DictionarySort.STATUS) {
      const lemmaIds = entries
        .map((e) => e.lemmaId)
        .filter((id): id is string => id !== null);
      const progresses = lemmaIds.length
        ? await this.prismaService.userWordProgress.findMany({
            where: { userId, lemmaId: { in: lemmaIds } },
            select: { lemmaId: true, nextReview: true, status: true },
          })
        : [];
      const progressMap = new Map(progresses.map((p) => [p.lemmaId, p]));
      ordered = [...entries];
      if (sort === DictionarySort.REVIEW) {
        ordered.sort((a, b) => {
          const ar = a.lemmaId ? progressMap.get(a.lemmaId)?.nextReview ?? null : null;
          const br = b.lemmaId ? progressMap.get(b.lemmaId)?.nextReview ?? null : null;
          if (!ar && !br) return 0;
          if (!ar) return 1;
          if (!br) return -1;
          return ar.getTime() - br.getTime();
        });
      } else {
        const priority: Record<string, number> = { NEW: 0, LEARNING: 1, KNOWN: 2 };
        ordered.sort(
          (a, b) =>
            (priority[a.learningLevel] ?? 0) - (priority[b.learningLevel] ?? 0),
        );
      }
    }

    const idx = ordered.findIndex((e) => e.id === id);
    const prev = idx > 0 ? ordered[idx - 1] : null;
    const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;

    return {
      prev: prev ? { id: prev.id, word: prev.word } : null,
      next: next ? { id: next.id, word: next.word } : null,
      position: idx >= 0 ? idx + 1 : null,
      total: ordered.length,
    };
  }

  async getUserDictionaryStats(userId: string) {
    const now = new Date();
    const [grouped, agg, dueCount] = await Promise.all([
      this.prismaService.userDictionaryEntry.groupBy({
        by: ["learningLevel"],
        _count: true,
        where: { userId },
      }),
      this.prismaService.userDictionaryEntry.aggregate({
        where: { userId },
        _count: true,
        _sum: { repetitionCount: true },
      }),
      this.prismaService.userWordProgress.count({
        where: {
          userId,
          status: { not: "KNOWN" },
          OR: [{ nextReview: null }, { nextReview: { lte: now } }],
        },
      }),
    ]);
    const byLevel: Record<string, number> = {
      NEW: 0,
      LEARNING: 0,
      KNOWN: 0,
    };
    for (const row of grouped) {
      byLevel[row.learningLevel] = row._count;
    }
    const total = agg._count;
    const known = byLevel.KNOWN;
    const masteryPercent = total > 0 ? Math.round((known / total) * 100) : 0;
    return {
      total,
      byLevel,
      totalRepetitions: agg._sum.repetitionCount ?? 0,
      dueCount,
      masteryPercent,
    };
  }

  async createUserDictionaryEntry(
    dto: CreateDictionaryEntryDto,
    userId: string,
  ) {
    // Enforce wordsInDictionary plan limit (-1 = безлимит)
    const [currentCount, subscription] = await Promise.all([
      this.prismaService.userDictionaryEntry.count({ where: { userId } }),
      this.prismaService.subscription.findFirst({
        where: {
          userId,
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
        },
        include: { plan: true },
        orderBy: { startDate: "desc" },
      }),
    ]);
    const planLimits = subscription?.plan?.limits as Record<string, number> | null;
    const wordsInDictionary = planLimits?.wordsInDictionary ?? 500;
    if (wordsInDictionary !== -1 && currentCount >= wordsInDictionary) {
      throw new ForbiddenException({ code: ErrorCode.VOCABULARY_LIMIT_REACHED, message: `Vocabulary limit of ${wordsInDictionary} words reached. Upgrade your plan to add more.` });
    }

    const { tokenId, word, translation, folderId, cefrLevel } = dto;
    let resolvedWord = word;
    let resolvedTranslation = translation;
    let lemmaId: string | null = null;
    let textId: string | null = null;

    if (tokenId) {
      const tokenInfo = await this.tokenService.getTokenInfo(tokenId, userId);
      resolvedWord = tokenInfo.word ?? resolvedWord ?? "";
      resolvedTranslation =
        tokenInfo.translation ?? resolvedTranslation ?? "";
      lemmaId = tokenInfo.lemmaId ?? null;
      textId = tokenInfo.textId ?? null;
      if (!resolvedWord || !resolvedTranslation) {
        throw new BadRequestException({ code: ErrorCode.TOKEN_MISSING_WORD_OR_TRANSLATION, message: "Token has no word or translation; provide word and translation in body" });
      }
    } else {
      if (!word?.trim()) {
        throw new BadRequestException({ code: ErrorCode.WORD_OR_TOKEN_REQUIRED, message: "Word or tokenId is required" });
      }
      if (!translation?.trim()) {
        throw new BadRequestException({ code: ErrorCode.TRANSLATION_OR_TOKEN_REQUIRED, message: "Translation or tokenId is required" });
      }
    }

    if (folderId) {
      const folder = await this.prismaService.userDictionaryFolder.findFirst({
        where: { id: folderId, userId },
      });
      if (!folder) {
        throw new BadRequestException({ code: ErrorCode.FOLDER_NOT_FOUND, message: "Folder not found or access denied" });
      }
    }

    const normalized = resolvedWord ? normalizeToken(resolvedWord) : null;

    // Upsert: если слово уже создано автоматически (registerClick), обновляем папку/уровень
    const entry = await this.prismaService.userDictionaryEntry.upsert({
      where: { userId_normalized: { userId, normalized: normalized ?? "" } },
      create: {
        word: resolvedWord ?? "",
        translation: resolvedTranslation ?? "",
        normalized,
        user: { connect: { id: userId } },
        ...(cefrLevel && { cefrLevel }),
        ...(folderId && { folder: { connect: { id: folderId } } }),
        ...(lemmaId && { lemma: { connect: { id: lemmaId } } }),
      },
      update: {
        // Обновляем перевод если токен дал более точный
        ...(resolvedTranslation && { translation: resolvedTranslation }),
        ...(cefrLevel && { cefrLevel }),
        // Папку обновляем только если явно передана
        ...(folderId
          ? { folder: { connect: { id: folderId } } }
          : {}),
        ...(lemmaId && { lemma: { connect: { id: lemmaId } } }),
      },
    });

    await this.prismaService.userEvent.create({
      data: {
        userId,
        type: UserEventType.ADD_TO_DICTIONARY,
        metadata: {
          entryId: entry.id,
          lemmaId,
          ...(textId ? { textId } : {}),
        },
      },
    });

    return entry;
  }

  async updateUserDictionaryEntry(
    dto: UpdateDictionaryEntryDto,
    id: string,
    userId: string,
  ) {
    const { learningLevel, cefrLevel, folderId, repetitionCount } = dto;
    const existingEntry = await this.getUserDictionaryEntry(id, userId);

    if (folderId !== undefined && folderId !== null) {
      const folder = await this.prismaService.userDictionaryFolder.findFirst({
        where: { id: folderId, userId },
      });
      if (!folder) {
        throw new BadRequestException({ code: ErrorCode.FOLDER_NOT_FOUND, message: "Folder not found or access denied" });
      }
    }

    const data: Prisma.UserDictionaryEntryUpdateInput = {};
    if (learningLevel !== undefined) data.learningLevel = learningLevel;
    if (cefrLevel !== undefined) data.cefrLevel = cefrLevel;
    if (repetitionCount !== undefined && repetitionCount !== null) {
      data.repetitionCount = repetitionCount;
    }
    if (folderId !== undefined) {
      data.folder =
        folderId === null
          ? { disconnect: true }
          : { connect: { id: folderId } };
    }

    const updated = await this.prismaService.userDictionaryEntry.update({
      where: { id },
      data,
    });

    // Keep SM-2 schedule in UserWordProgress consistent when learning status changes.
    if (
      learningLevel !== undefined &&
      learningLevel !== existingEntry.learningLevel &&
      updated.lemmaId
    ) {
      try {
        await this.wordProgressService.setWordStatus(
          userId,
          updated.lemmaId,
          learningLevel,
        );
      } catch {
        // SM-2 sync is best-effort; the entry update already succeeded.
      }
    }

    return updated;
  }

  async deleteUserDictionaryEntryById(id: string, userId: string) {
    const existingEntry = await this.getUserDictionaryEntry(id, userId);

    await this.prismaService.userDictionaryEntry.delete({
      where: { id: existingEntry.id },
    });

    return "Dictionary entry deleted";
  }

  async bulkAssignEntriesToFolder(
    assignments: { id: string; folderId?: string | null }[],
    userId: string,
  ) {
    const entryIds = assignments.map((a) => a.id);
    const uniqueFolderIds = Array.from(
      new Set(
        assignments
          .map((a) => a.folderId)
          .filter((id): id is string => typeof id === "string"),
      ),
    );

    const [ownedEntries, ownedFolders] = await Promise.all([
      this.prismaService.userDictionaryEntry.findMany({
        where: { id: { in: entryIds }, userId },
        select: { id: true },
      }),
      uniqueFolderIds.length > 0
        ? this.prismaService.userDictionaryFolder.findMany({
            where: { id: { in: uniqueFolderIds }, userId },
            select: { id: true },
          })
        : Promise.resolve([] as { id: string }[]),
    ]);

    if (ownedEntries.length !== entryIds.length) {
      throw new BadRequestException({ code: ErrorCode.ENTRIES_NOT_BELONG_TO_USER, message: "Some dictionary entries do not belong to user or do not exist" });
    }
    if (ownedFolders.length !== uniqueFolderIds.length) {
      throw new BadRequestException({ code: ErrorCode.FOLDERS_NOT_BELONG_TO_USER, message: "Some folders do not belong to user or do not exist" });
    }

    await this.prismaService.$transaction(
      assignments.map(({ id, folderId }) =>
        this.prismaService.userDictionaryEntry.update({
          where: { id },
          data: { folderId: folderId ?? null },
        }),
      ),
    );

    return { updated: assignments.length };
  }

  async getDueWords(userId: string) {
    const now = new Date();
    // Words due for review: UserWordProgress.nextReview <= now, joined with UserDictionaryEntry
    const progresses = await this.prismaService.userWordProgress.findMany({
      where: {
        userId,
        status: { not: "KNOWN" },
        OR: [{ nextReview: null }, { nextReview: { lte: now } }],
      },
      orderBy: { nextReview: "asc" },
      select: {
        lemmaId: true,
        nextReview: true,
        status: true,
        lemma: {
          select: {
            baseForm: true,
            partOfSpeech: true,
            userDictionaryEntries: {
              where: { userId },
              take: 1,
              select: {
                id: true,
                word: true,
                translation: true,
                learningLevel: true,
                cefrLevel: true,
                folderId: true,
              },
            },
          },
        },
      },
    });

    // Next upcoming review (first one after now)
    const nextScheduled = await this.prismaService.userWordProgress.findFirst({
      where: {
        userId,
        nextReview: { gt: now },
      },
      orderBy: { nextReview: "asc" },
      select: { nextReview: true },
    });

    return {
      count: progresses.length,
      nextScheduledAt: nextScheduled?.nextReview ?? null,
      words: progresses.map((p) => ({
        lemmaId: p.lemmaId,
        nextReview: p.nextReview,
        status: p.status,
        baseForm: p.lemma.baseForm,
        partOfSpeech: p.lemma.partOfSpeech,
        dictionaryEntry: p.lemma.userDictionaryEntries[0] ?? null,
      })),
    };
  }

}
