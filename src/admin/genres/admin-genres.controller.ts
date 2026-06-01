import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { PermissionCode } from "@prisma/client";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { AdminGenresService } from "./admin-genres.service";
import { CreateGenreDto, UpdateGenreDto } from "./dto/genre.dto";

@ApiTags("admin/genres")
@ApiBearerAuth()
@Controller("admin/genres")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@ApiForbiddenResponse({ description: "CAN_EDIT_TEXTS permission required." })
export class AdminGenresController {
  constructor(private readonly adminGenresService: AdminGenresService) {}

  @Get()
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @ApiOperation({ summary: "List all genres with text count" })
  @ApiOkResponse({ description: "Array of genres with id, name, slug, sortOrder, _count.texts." })
  async getAllGenres() {
    return this.adminGenresService.getAllGenres();
  }

  @Post()
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a genre" })
  @ApiCreatedResponse({ description: "Genre created." })
  @ApiConflictResponse({ description: "Genre with this name or slug already exists." })
  async createGenre(@Body() dto: CreateGenreDto) {
    return this.adminGenresService.createGenre(dto);
  }

  @Patch(":id")
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @ApiOperation({ summary: "Update a genre" })
  @ApiParam({ name: "id", description: "Genre ID (UUID)" })
  @ApiOkResponse({ description: "Genre updated." })
  @ApiNotFoundResponse({ description: "Genre not found." })
  @ApiConflictResponse({ description: "Genre with this name or slug already exists." })
  async updateGenre(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateGenreDto) {
    return this.adminGenresService.updateGenre(id, dto);
  }

  @Delete(":id")
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a genre", description: "Sets genreId to null on all associated texts." })
  @ApiParam({ name: "id", description: "Genre ID (UUID)" })
  @ApiNoContentResponse({ description: "Genre deleted." })
  @ApiNotFoundResponse({ description: "Genre not found." })
  async deleteGenre(@Param("id", ParseUUIDPipe) id: string) {
    await this.adminGenresService.deleteGenre(id);
  }
}
