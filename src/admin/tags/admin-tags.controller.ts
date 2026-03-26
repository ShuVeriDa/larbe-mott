import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { PermissionCode } from "@prisma/client";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { AdminTagsService } from "./admin-tags.service";
import { CreateTagDto, RenameTagDto } from "./dto/tag.dto";

@ApiTags("admin/tags")
@ApiBearerAuth()
@Controller("admin/tags")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@ApiForbiddenResponse({
  description: "Forbidden. CAN_EDIT_TEXTS permission required.",
})
export class AdminTagsController {
  constructor(private readonly adminTagsService: AdminTagsService) {}

  @Get()
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @ApiOperation({
    summary: "List all tags",
    description: "Returns all tags with text count.",
  })
  @ApiOkResponse({ description: "Array of tags with id, name, _count.texts." })
  async getAllTags() {
    return this.adminTagsService.getAllTags();
  }

  @Post()
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a tag" })
  @ApiCreatedResponse({ description: "Tag created." })
  @ApiConflictResponse({ description: "Tag with this name already exists." })
  async createTag(@Body() dto: CreateTagDto) {
    return this.adminTagsService.createTag(dto.name);
  }

  @Patch(":id")
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @ApiOperation({ summary: "Rename a tag" })
  @ApiParam({ name: "id", description: "Tag ID (UUID)" })
  @ApiOkResponse({ description: "Tag renamed." })
  @ApiNotFoundResponse({ description: "Tag not found." })
  @ApiConflictResponse({ description: "Tag with this name already exists." })
  async renameTag(@Param("id") id: string, @Body() dto: RenameTagDto) {
    return this.adminTagsService.renameTag(id, dto.name);
  }

  @Delete(":id")
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete a tag",
    description: "Deletes the tag and removes it from all texts.",
  })
  @ApiParam({ name: "id", description: "Tag ID (UUID)" })
  @ApiNoContentResponse({ description: "Tag deleted." })
  @ApiNotFoundResponse({ description: "Tag not found." })
  async deleteTag(@Param("id") id: string) {
    await this.adminTagsService.deleteTag(id);
  }
}
