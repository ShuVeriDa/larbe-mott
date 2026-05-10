import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreatePageBookmarkDto } from './dto/create-page-bookmark.dto';

@Injectable()
export class PageBookmarkService {
  constructor(private readonly prisma: PrismaService) {}

  getAll = async (userId: string, textId: string) => {
    return this.prisma.userPageBookmark.findMany({
      where: { userId, textId },
      orderBy: { pageNumber: 'asc' },
    });
  };

  toggle = async (userId: string, dto: CreatePageBookmarkDto) => {
    const existing = await this.prisma.userPageBookmark.findUnique({
      where: { userId_textId_pageNumber: { userId, textId: dto.textId, pageNumber: dto.pageNumber } },
    });
    if (existing) {
      await this.prisma.userPageBookmark.delete({ where: { id: existing.id } });
      return { bookmarked: false, pageNumber: dto.pageNumber };
    }
    await this.prisma.userPageBookmark.create({ data: { userId, ...dto } });
    return { bookmarked: true, pageNumber: dto.pageNumber };
  };

  remove = async (userId: string, id: string) => {
    await this.prisma.userPageBookmark.deleteMany({ where: { id, userId } });
  };
}
