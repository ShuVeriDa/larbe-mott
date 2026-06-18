import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { PermissionCode } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { AdminPermission } from 'src/auth/decorators/admin-permission.decorator';
import { User } from 'src/user/decorators/user.decorator';
import { AnnouncementService } from './announcement.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { ListAnnouncementsQueryDto } from './dto/list-announcements-query.dto';

@ApiTags('admin/announcements')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
@ApiForbiddenResponse({ description: 'Forbidden. CAN_MANAGE_USERS permission required.' })
@Controller('admin/announcements')
export class AnnouncementController {
  constructor(private readonly announcementService: AnnouncementService) {}

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  @ApiOperation({ summary: 'Create and broadcast a platform announcement' })
  create(
    @Body() dto: CreateAnnouncementDto,
    @User('id') adminId: string,
  ) {
    return this.announcementService.create(dto, adminId);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Get()
  @ApiOperation({ summary: 'List all non-deleted announcements' })
  findAll(@Query() query: ListAnnouncementsQueryDto) {
    return this.announcementService.findAll(query);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_USERS)
  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete an announcement' })
  softDelete(@Param('id') id: string) {
    return this.announcementService.softDelete(id);
  }
}
