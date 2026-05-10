import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { PageBookmarkController } from './page-bookmark.controller';
import { PageBookmarkService } from './page-bookmark.service';

@Module({
  controllers: [PageBookmarkController],
  providers: [PageBookmarkService, PrismaService],
})
export class PageBookmarkModule {}
