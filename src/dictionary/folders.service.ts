import {
  BadRequestException,
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
    return await this.prismaService.userDictionaryFolder.findMany({
      where: {
        userId,
      },
      orderBy: {
        sortOrder: "asc",
      },
    });
  }

  async getUserDictionaryFolder(id: string, userId: string) {
    const folder = await this.prismaService.userDictionaryFolder.findUnique({
      where: { id },
    });
    if (!folder || folder.userId !== userId) {
      throw new NotFoundException("Dictionary folder not found");
    }
    return folder;
  }

  async createUserDictionaryFolder(
    dto: CreateDictionaryFolderDto,
    userId: string,
  ) {
    const existingFolder =
      await this.prismaService.userDictionaryFolder.findFirst({
        where: {
          name: dto.name,
          userId,
        },
      });
    if (existingFolder) {
      throw new BadRequestException("Dictionary folder already exists");
    }

    return await this.prismaService.userDictionaryFolder.create({
      data: {
        name: dto.name,
        userId,
      },
    });
  }

  async updateUserDictionaryFolder(
    dto: UpdateDictionaryFolderDto,
    id: string,
    userId: string,
  ) {
    const folder = await this.getUserDictionaryFolder(id, userId);
    if (!folder) {
      throw new NotFoundException("Dictionary folder not found");
    }
    const data: { name?: string; sortOrder?: number } = {};
    if (dto.name !== undefined) data.name = dto.name;
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
