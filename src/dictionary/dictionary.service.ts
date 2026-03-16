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
    return await this.prismaService.userDictionaryEntry.findMany({
      where: { userId },
      orderBy: { addedAt: "desc" },
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
    const [grouped, agg] = await Promise.all([
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
    ]);
    const byLevel: Record<string, number> = {
      NEW: 0,
      LEARNING: 0,
      KNOWN: 0,
    };
    for (const row of grouped) {
      byLevel[row.learningLevel] = row._count;
    }
    return {
      total: agg._count,
      byLevel,
      totalRepetitions: agg._sum.repetitionCount ?? 0,
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
    const { learningLevel, folderId, repetitionCount } = dto;
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
