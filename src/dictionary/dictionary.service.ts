import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, UserEventType } from "@prisma/client";
import { normalizeToken } from "src/markup-engine/tokenizer/tokenizer.utils";
import { PrismaService } from "src/prisma.service";
import { TokenService } from "src/token/token.service";
import { CreateDictionaryEntryDto } from "./dto/create-dictionary-entry.dto";
import { DictionarySort, GetDictionaryEntriesDto } from "./dto/get-dictionary-entries.dto";
import { UpdateDictionaryEntryDto } from "./dto/update-dictionary-entry.dto";

@Injectable()
export class DictionaryService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  async getUserDictionaryEntries(userId: string, query: GetDictionaryEntriesDto = {}) {
    const { status, cefrLevel, folderId, noFolder, sort = DictionarySort.ADDED } = query;

    const where: Prisma.UserDictionaryEntryWhereInput = { userId };
    if (status) where.learningLevel = status;
    if (cefrLevel) where.cefrLevel = cefrLevel;
    if (noFolder) {
      where.folderId = null;
    } else if (folderId) {
      where.folderId = folderId;
    }

    const orderBy = this.buildOrderBy(sort);

    const entries = await this.prismaService.userDictionaryEntry.findMany({
      where,
      orderBy,
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
    });

    // Attach nextReview from UserWordProgress for entries that have a lemmaId
    const lemmaIds = entries
      .map((e) => e.lemmaId)
      .filter((id): id is string => id !== null);

    const progressMap = new Map<string, { nextReview: Date | null; status: string }>();
    if (lemmaIds.length > 0) {
      const progresses = await this.prismaService.userWordProgress.findMany({
        where: { userId, lemmaId: { in: lemmaIds } },
        select: { lemmaId: true, nextReview: true, status: true },
      });
      for (const p of progresses) {
        progressMap.set(p.lemmaId, { nextReview: p.nextReview, status: p.status });
      }
    }

    const mapped = entries.map((entry) => {
      const progress = entry.lemmaId ? progressMap.get(entry.lemmaId) : null;
      return {
        ...entry,
        nextReview: progress?.nextReview ?? null,
        wordProgressStatus: progress?.status ?? null,
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

    return mapped;
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
      throw new NotFoundException("Dictionary entry not found");
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
            morphForms: {
              select: { form: true, grammarTag: true },
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
          },
        },
      },
    });

    if (!entry || entry.userId !== userId) {
      throw new NotFoundException("Dictionary entry not found");
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
          select: { id: true, quality: true, correct: true, createdAt: true },
        })
      : [];

    const successCount = reviewLogs.filter((r) => r.correct).length;

    // Flatten senses from all headwords (deduplicate by id)
    const seenSenseIds = new Set<string>();
    const senses: Array<{
      id: string;
      definition: string;
      notes: string | null;
      examples: { text: string; translation: string | null }[];
    }> = [];
    for (const hw of entry.lemma?.headwords ?? []) {
      for (const sense of hw.entry.senses) {
        if (!seenSenseIds.has(sense.id)) {
          seenSenseIds.add(sense.id);
          senses.push(sense);
        }
      }
    }

    return {
      id: entry.id,
      word: entry.word,
      translation: entry.translation,
      normalized: entry.normalized,
      learningLevel: entry.learningLevel,
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
            morphForms: entry.lemma.morphForms,
            wordContexts: entry.lemma.wordContexts,
          }
        : null,
      senses,
      sm2: progress ?? null,
      reviewHistory: {
        totalReviews: reviewLogs.length,
        successCount,
        logs: reviewLogs,
      },
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
          nextReview: { lte: now },
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
    const { tokenId, word, translation, folderId } = dto;
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
        throw new BadRequestException(
          "Token has no word or translation; provide word and translation in body",
        );
      }
    } else {
      if (!word?.trim()) {
        throw new BadRequestException("Word or tokenId is required");
      }
      if (!translation?.trim()) {
        throw new BadRequestException("Translation or tokenId is required");
      }
    }

    if (folderId) {
      const folder = await this.prismaService.userDictionaryFolder.findFirst({
        where: { id: folderId, userId },
      });
      if (!folder) {
        throw new BadRequestException("Folder not found or access denied");
      }
    }

    const normalized = resolvedWord
      ? normalizeToken(resolvedWord)
      : null;
    const data: Prisma.UserDictionaryEntryCreateInput = {
      word: resolvedWord ?? "",
      translation: resolvedTranslation ?? "",
      normalized,
      user: { connect: { id: userId } },
      ...(folderId && { folder: { connect: { id: folderId } } }),
      ...(lemmaId && { lemma: { connect: { id: lemmaId } } }),
    };

    try {
      const entry = await this.prismaService.userDictionaryEntry.create({
        data,
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
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new ConflictException(
          "This word is already in your dictionary (same normalized form)",
        );
      }
      throw e;
    }
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
        throw new BadRequestException("Folder not found or access denied");
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

    return await this.prismaService.userDictionaryEntry.update({
      where: { id },
      data,
    });
  }

  async deleteUserDictionaryEntryById(id: string, userId: string) {
    const existingEntry = await this.getUserDictionaryEntry(id, userId);

    await this.prismaService.userDictionaryEntry.delete({
      where: { id: existingEntry.id },
    });

    return "Dictionary entry deleted";
  }

  async getDueWords(userId: string) {
    const now = new Date();
    // Words due for review: UserWordProgress.nextReview <= now, joined with UserDictionaryEntry
    const progresses = await this.prismaService.userWordProgress.findMany({
      where: {
        userId,
        nextReview: { lte: now },
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
