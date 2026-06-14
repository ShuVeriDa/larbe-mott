import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ChScript, PermissionCode } from '@prisma/client';
import { AdminPermission } from 'src/auth/decorators/admin-permission.decorator';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { User } from 'src/user/decorators/user.decorator';
import { GenerateScriptVersionDto } from './dto/generate-script-version.dto';
import { UpdateScriptPageDto } from './dto/update-script-page.dto';
import { TextScriptService } from './text-script.service';

@ApiTags('text-script')
@Controller()
export class TextScriptController {
  constructor(private readonly service: TextScriptService) {}

  // ─── Admin: Library texts ─────────────────────────────────────────────────

  @Post('admin/texts/:id/script-versions')
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Generate a script version for a library text (admin)' })
  @ApiParam({ name: 'id', description: 'Text ID' })
  generateTextVersion(
    @Param('id', ParseUUIDPipe) textId: string,
    @Body() dto: GenerateScriptVersionDto,
  ) {
    return this.service.generateTextScriptVersion(textId, dto.script);
  }

  @Get('admin/texts/:id/script-versions')
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List script versions for a library text (admin)' })
  @ApiParam({ name: 'id', description: 'Text ID' })
  @ApiOkResponse({ description: 'Array of script version statuses' })
  getTextVersions(@Param('id', ParseUUIDPipe) textId: string) {
    return this.service.getTextScriptVersions(textId);
  }

  @Patch('admin/texts/:id/script-versions/:script/pages/:pageNumber')
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Edit a single page of a library text script version (admin)' })
  @ApiParam({ name: 'id', description: 'Text ID' })
  @ApiParam({ name: 'script', enum: ChScript })
  @ApiParam({ name: 'pageNumber', description: 'Page number (1-based)' })
  updateTextPage(
    @Param('id', ParseUUIDPipe) textId: string,
    @Param('script') script: ChScript,
    @Param('pageNumber', ParseIntPipe) pageNumber: number,
    @Body() dto: UpdateScriptPageDto,
  ) {
    return this.service.updateTextScriptPage(textId, script, pageNumber, dto.contentRich);
  }

  @Delete('admin/texts/:id/script-versions/:script')
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Script version deleted' })
  @ApiOperation({ summary: 'Delete a library text script version (admin)' })
  @ApiParam({ name: 'id', description: 'Text ID' })
  @ApiParam({ name: 'script', enum: ChScript })
  deleteTextVersion(
    @Param('id', ParseUUIDPipe) textId: string,
    @Param('script') script: ChScript,
  ) {
    return this.service.deleteTextScriptVersion(textId, script);
  }

  // ─── User texts ───────────────────────────────────────────────────────────

  @Post('user-texts/:id/script-versions')
  @Auth()
  @ApiBearerAuth()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Generate a script version for a user text' })
  @ApiParam({ name: 'id', description: 'UserText ID' })
  generateUserTextVersion(
    @Param('id', ParseUUIDPipe) userTextId: string,
    @Body() dto: GenerateScriptVersionDto,
    @User('id') userId: string,
  ) {
    return this.service.generateUserTextScriptVersion(userTextId, userId, dto.script);
  }

  @Get('user-texts/:id/script-versions')
  @Auth()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List script versions for a user text' })
  @ApiParam({ name: 'id', description: 'UserText ID' })
  @ApiOkResponse({ description: 'Array of script version statuses' })
  getUserTextVersions(
    @Param('id', ParseUUIDPipe) userTextId: string,
    @User('id') userId: string,
  ) {
    return this.service.getUserTextScriptVersions(userTextId, userId);
  }

  @Patch('user-texts/:id/script-versions/:script/pages/:pageNumber')
  @Auth()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Edit a single page of a user text script version' })
  @ApiParam({ name: 'id', description: 'UserText ID' })
  @ApiParam({ name: 'script', enum: ChScript })
  @ApiParam({ name: 'pageNumber', description: 'Page number (1-based)' })
  updateUserTextPage(
    @Param('id', ParseUUIDPipe) userTextId: string,
    @Param('script') script: ChScript,
    @Param('pageNumber', ParseIntPipe) pageNumber: number,
    @Body() dto: UpdateScriptPageDto,
    @User('id') userId: string,
  ) {
    return this.service.updateUserTextScriptPage(userTextId, userId, script, pageNumber, dto.contentRich);
  }

  @Delete('user-texts/:id/script-versions/:script')
  @Auth()
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Script version deleted' })
  @ApiOperation({ summary: 'Delete a user text script version' })
  @ApiParam({ name: 'id', description: 'UserText ID' })
  @ApiParam({ name: 'script', enum: ChScript })
  deleteUserTextVersion(
    @Param('id', ParseUUIDPipe) userTextId: string,
    @Param('script') script: ChScript,
    @User('id') userId: string,
  ) {
    return this.service.deleteUserTextScriptVersion(userTextId, userId, script);
  }
}
