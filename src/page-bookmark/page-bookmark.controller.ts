import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { User } from 'src/user/decorators/user.decorator';
import { CreatePageBookmarkDto } from './dto/create-page-bookmark.dto';
import { PageBookmarkService } from './page-bookmark.service';

@ApiTags('page-bookmarks')
@ApiBearerAuth()
@Auth()
@Controller('page-bookmarks')
export class PageBookmarkController {
  constructor(private readonly pageBookmarkService: PageBookmarkService) {}

  @Get()
  getAll(@User('id') userId: string, @Query('textId') textId: string) {
    return this.pageBookmarkService.getAll(userId, textId);
  }

  @Post('toggle')
  toggle(@User('id') userId: string, @Body() dto: CreatePageBookmarkDto) {
    return this.pageBookmarkService.toggle(userId, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@User('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.pageBookmarkService.remove(userId, id);
  }
}
