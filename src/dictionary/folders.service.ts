import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { SubscriptionStatus } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { ErrorCode } from "src/common/errors/error-codes";
import { CreateDictionaryFolderDto } from "./dto/create-folder";
import { ReorderFoldersDto } from "./dto/reorder-folders.dto";
import { UpdateDictionaryFolderDto } from "./dto/update-folder";

@Injectable()
export class FoldersService {
  constructor(private readonly prismaService: PrismaService) {}

  async getUserDictionaryFolders(userId: string) {
    const folders = await this.prismaService.userDictionaryFolder.findMany({
      where: { userId },
      orderBy: { sortOrder: "asc" },
      include: {
        entries: {
          select: { learningLevel: true, addedAt: true, updatedAt: true },
        },
      },
    });

    return folders.map((folder) => {
      const { entries, ...rest } = folder;

      const wordCounts = { NEW: 0, LEARNING: 0, KNOWN: 0 };
      for (const entry of entries) {
        wordCounts[entry.learningLevel]++;
      }

      const total = entries.length;
      const progress = total > 0 ? Math.round((wordCounts.KNOWN / total) * 100) : 0;

      // последнее изменение — максимум среди addedAt и updatedAt всех слов
      let lastModified: Date | null = null;
      for (const entry of entries) {
        const latest = entry.updatedAt > entry.addedAt ? entry.updatedAt : entry.addedAt;
        if (!lastModified || latest > lastModified) lastModified = latest;
      }

      return {
        ...rest,
        wordCounts,
        total,
        progress,
        lastModified,
      };
    });
  }

  async getUserDictionaryFolder(id: string, userId: string) {
    const folder = await this.prismaService.userDictionaryFolder.findUnique({
      where: { id },
      include: {
        entries: {
          select: { learningLevel: true, addedAt: true, updatedAt: true },
        },
      },
    });
    if (!folder || folder.userId !== userId) {
      throw new NotFoundException({ code: ErrorCode.FOLDER_NOT_FOUND, message: "Dictionary folder not found" });
    }

    const { entries, ...rest } = folder;

    const wordCounts = { NEW: 0, LEARNING: 0, KNOWN: 0 };
    for (const entry of entries) {
      wordCounts[entry.learningLevel]++;
    }

    const total = entries.length;
    const progress = total > 0 ? Math.round((wordCounts.KNOWN / total) * 100) : 0;

    let lastModified: Date | null = null;
    for (const entry of entries) {
      const latest = entry.updatedAt > entry.addedAt ? entry.updatedAt : entry.addedAt;
      if (!lastModified || latest > lastModified) lastModified = latest;
    }

    return { ...rest, wordCounts, total, progress, lastModified };
  }

  async getUserDictionaryFoldersSummary(userId: string) {
    const [
      foldersCount,
      wordsInFolders,
      knownWords,
      wordsWithoutFolder,
      maxFolders,
    ] = await Promise.all([
      this.prismaService.userDictionaryFolder.count({ where: { userId } }),
      this.prismaService.userDictionaryEntry.count({
        where: { userId, folderId: { not: null } },
      }),
      this.prismaService.userDictionaryEntry.count({
        where: { userId, learningLevel: "KNOWN" },
      }),
      this.prismaService.userDictionaryEntry.count({
        where: { userId, folderId: null },
      }),
      this.resolveMaxFolders(userId),
    ]);

    return {
      foldersCount,
      wordsInFolders,
      knownWords,
      wordsWithoutFolder,
      maxFolders,
    };
  }

  async createUserDictionaryFolder(
    dto: CreateDictionaryFolderDto,
    userId: string,
  ) {
    const [existingFolder, foldersCount, maxFolders] = await Promise.all([
      this.prismaService.userDictionaryFolder.findFirst({
        where: { name: dto.name, userId },
      }),
      this.prismaService.userDictionaryFolder.count({ where: { userId } }),
      this.resolveMaxFolders(userId),
    ]);

    if (existingFolder) {
      throw new ConflictException({ code: ErrorCode.FOLDER_ALREADY_EXISTS, message: "Dictionary folder already exists" });
    }

    if (maxFolders === 0) {
      throw new ForbiddenException({ code: ErrorCode.FOLDERS_NOT_AVAILABLE, message: "Folders are not available on your plan. Upgrade to Premium." });
    }
    if (maxFolders > 0 && foldersCount >= maxFolders) {
      throw new ForbiddenException({ code: ErrorCode.FOLDER_LIMIT_REACHED, message: `Folder limit of ${maxFolders} reached. Upgrade your plan to create more.` });
    }

    return await this.prismaService.userDictionaryFolder.create({
      data: {
        name: dto.name,
        description: dto.description,
        color: dto.color,
        icon: dto.icon,
        userId,
      },
    });
  }

  async updateUserDictionaryFolder(
    dto: UpdateDictionaryFolderDto,
    id: string,
    userId: string,
  ) {
    await this.getUserDictionaryFolder(id, userId);
    const data: {
      name?: string;
      description?: string;
      color?: string;
      icon?: string;
      sortOrder?: number;
    } = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.color !== undefined) data.color = dto.color;
    if (dto.icon !== undefined) data.icon = dto.icon;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    return await this.prismaService.userDictionaryFolder.update({
      where: { id },
      data,
    });
  }

  async reorderUserDictionaryFolders(
    dto: ReorderFoldersDto,
    userId: string,
  ) {
    const { orderedIds } = dto;

    const unique = new Set(orderedIds);
    if (unique.size !== orderedIds.length) {
      throw new BadRequestException({ code: ErrorCode.DUPLICATE_FOLDER_ORDER_IDS, message: "orderedIds contains duplicates" });
    }

    const folders = await this.prismaService.userDictionaryFolder.findMany({
      where: { userId },
      select: { id: true },
    });
    const ownedIds = new Set(folders.map((f) => f.id));

    if (orderedIds.length !== ownedIds.size) {
      throw new BadRequestException({ code: ErrorCode.FOLDER_ORDER_IDS_MISMATCH, message: "orderedIds must contain exactly the user's folder IDs" });
    }
    for (const id of orderedIds) {
      if (!ownedIds.has(id)) {
        throw new BadRequestException({ code: ErrorCode.FOLDER_NOT_BELONG_TO_USER, message: `Folder ${id} does not belong to user` });
      }
    }

    await this.prismaService.$transaction(
      orderedIds.map((id, index) =>
        this.prismaService.userDictionaryFolder.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    return { reordered: orderedIds.length };
  }

  async deleteUserDictionaryFolderById(id: string, userId: string) {
    const existingFolder = await this.getUserDictionaryFolder(id, userId);
    await this.prismaService.userDictionaryFolder.delete({
      where: { id: existingFolder.id },
    });
    return "Dictionary folder deleted";
  }

  private async resolveMaxFolders(userId: string): Promise<number> {
    const subscription = await this.prismaService.subscription.findFirst({
      where: {
        userId,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
      },
      include: { plan: true },
      orderBy: { startDate: "desc" },
    });
    const planLimits = subscription?.plan?.limits as Record<string, unknown> | null;
    const dictionaryFolders = planLimits?.["dictionaryFolders"];
    const raw = planLimits?.["maxFolders"];

    if (typeof raw === "number") return raw;

    // Fallback: если ключа нет — выводим из булевого dictionaryFolders
    if (dictionaryFolders === true) return -1;
    return 0;
  }
}
