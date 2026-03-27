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
import { UpdateDictionaryEntryDto } from "./dto/update-dictionary-entry.dto";

@Injectable()
export class DictionaryService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  async getUserDictionaryEntries(userId: string) {
    const entries = await this.prismaService.userDictionaryEntry.findMany({
      where: { userId },
      orderBy: { addedAt: "desc" },
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

    return entries.map((entry) => {
      const progress = entry.lemmaId ? progressMap.get(entry.lemmaId) : null;
      return {
        ...entry,
        nextReview: progress?.nextReview ?? null,
        wordProgressStatus: progress?.status ?? null,
      };
    });
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

    if (tokenId) {
      const tokenInfo = await this.tokenService.getTokenInfo(tokenId, userId);
      resolvedWord = tokenInfo.word ?? resolvedWord ?? "";
      resolvedTranslation =
        tokenInfo.translation ?? resolvedTranslation ?? "";
      lemmaId = tokenInfo.lemmaId ?? null;
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

  async deleteAllUserDictionaryEntries(userId: string) {
    const existingEntries = await this.getUserDictionaryEntries(userId);
    if (!existingEntries.length) {
      throw new NotFoundException("No dictionary entries found");
    }
    await this.prismaService.userDictionaryEntry.deleteMany({
      where: { userId },
    });
    return "All dictionary entries deleted";
  }
}
