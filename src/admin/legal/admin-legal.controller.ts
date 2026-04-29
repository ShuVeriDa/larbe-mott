import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import { AdminLegalService } from "./admin-legal.service";
import { CreateLegalDocumentDto } from "./dto/create-legal-document.dto";
import { FetchLegalDocumentsDto } from "./dto/fetch-legal-documents.dto";
import { UpdateLegalDocumentDto } from "./dto/update-legal-document.dto";

@ApiTags("admin/legal")
@ApiBearerAuth()
@Controller("admin/legal")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@ApiForbiddenResponse({
  description: "Forbidden. CAN_MANAGE_LEGAL permission required.",
})
export class AdminLegalController {
  constructor(private readonly adminLegalService: AdminLegalService) {}

  @Get()
  @AdminPermission(PermissionCode.CAN_MANAGE_LEGAL)
  @ApiOperation({
    summary: "List legal documents (drafts + published)",
    description:
      "Опционально фильтр по slug / lang / isPublished. Сортировка: slug asc, lang asc.",
  })
  @ApiOkResponse({ description: "Array of legal documents" })
  async list(@Query() filter: FetchLegalDocumentsDto) {
    return this.adminLegalService.list(filter);
  }

  @Get(":id")
  @AdminPermission(PermissionCode.CAN_MANAGE_LEGAL)
  @ApiOperation({ summary: "Get a legal document by id" })
  @ApiParam({ name: "id", description: "Document UUID" })
  @ApiOkResponse({ description: "Legal document" })
  @ApiNotFoundResponse({ description: "Document not found" })
  async getOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.adminLegalService.getById(id);
  }

  @Post()
  @AdminPermission(PermissionCode.CAN_MANAGE_LEGAL)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a legal document" })
  @ApiCreatedResponse({ description: "Created document" })
  @ApiConflictResponse({
    description: "Document with this slug+lang already exists",
  })
  async create(@Body() dto: CreateLegalDocumentDto) {
    return this.adminLegalService.create(dto);
  }

  @Patch(":id")
  @AdminPermission(PermissionCode.CAN_MANAGE_LEGAL)
  @ApiOperation({
    summary: "Update title and/or content",
    description:
      "Изменение content инкрементит version (для аудита версий ToS). Изменение только title — нет.",
  })
  @ApiParam({ name: "id", description: "Document UUID" })
  @ApiOkResponse({ description: "Updated document" })
  @ApiNotFoundResponse({ description: "Document not found" })
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateLegalDocumentDto,
  ) {
    return this.adminLegalService.update(id, dto);
  }

  @Post(":id/publish")
  @AdminPermission(PermissionCode.CAN_MANAGE_LEGAL)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Publish the document (visible on public /legal/:slug)" })
  @ApiParam({ name: "id", description: "Document UUID" })
  @ApiOkResponse({ description: "Published document" })
  @ApiNotFoundResponse({ description: "Document not found" })
  async publish(@Param("id", ParseUUIDPipe) id: string) {
    return this.adminLegalService.publish(id);
  }

  @Post(":id/unpublish")
  @AdminPermission(PermissionCode.CAN_MANAGE_LEGAL)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Unpublish the document (becomes draft, hidden from public)" })
  @ApiParam({ name: "id", description: "Document UUID" })
  @ApiOkResponse({ description: "Unpublished document" })
  @ApiNotFoundResponse({ description: "Document not found" })
  async unpublish(@Param("id", ParseUUIDPipe) id: string) {
    return this.adminLegalService.unpublish(id);
  }

  @Delete(":id")
  @AdminPermission(PermissionCode.CAN_MANAGE_LEGAL)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a legal document permanently" })
  @ApiParam({ name: "id", description: "Document UUID" })
  @ApiNoContentResponse({ description: "Document deleted" })
  @ApiNotFoundResponse({ description: "Document not found" })
  async remove(@Param("id", ParseUUIDPipe) id: string) {
    await this.adminLegalService.remove(id);
  }
}
