import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { CreateDictionaryFolderDto } from "./dto/create-folder";
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
      throw new NotFoundException("Dictionary folder not found");
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
    const [foldersCount, wordsInFolders, knownWords, wordsWithoutFolder] =
      await Promise.all([
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
      ]);

    return { foldersCount, wordsInFolders, knownWords, wordsWithoutFolder };
  }

  async createUserDictionaryFolder(
    dto: CreateDictionaryFolderDto,
    userId: string,
  ) {
    const existingFolder =
      await this.prismaService.userDictionaryFolder.findFirst({
        where: { name: dto.name, userId },
      });
    if (existingFolder) {
      throw new ConflictException("Dictionary folder already exists");
    }

    return await this.prismaService.userDictionaryFolder.create({
      data: {
        name: dto.name,
        description: dto.description,
        color: dto.color,
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
    const data: { name?: string; description?: string; color?: string; sortOrder?: number } = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.color !== undefined) data.color = dto.color;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    return await this.prismaService.userDictionaryFolder.update({
      where: { id },
      data,
    });
  }

  async deleteUserDictionaryFolderById(id: string, userId: string) {
    const existingFolder = await this.getUserDictionaryFolder(id, userId);
    await this.prismaService.userDictionaryFolder.delete({
      where: { id: existingFolder.id },
    });
    return "Dictionary folder deleted";
  }
}
