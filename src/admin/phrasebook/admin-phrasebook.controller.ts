import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { PermissionCode } from "@prisma/client";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { AdminPhrasebookService } from "./admin-phrasebook.service";
import {
  CreatePhrasebookCategoryDto,
  CreatePhrasebookPhraseDto,
  UpdatePhrasebookCategoryDto,
  UpdatePhrasebookPhraseDto,
} from "./dto/phrasebook.dto";

@ApiTags("admin/phrasebook")
@ApiBearerAuth()
@Controller("admin/phrasebook")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@ApiForbiddenResponse({
  description: "Forbidden. CAN_EDIT_TEXTS permission required.",
})
export class AdminPhrasebookController {
  constructor(private readonly service: AdminPhrasebookService) {}

  // ── Categories ──────────────────────────────────────────────────────────

  @Get("categories")
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @ApiOperation({ summary: "List all phrasebook categories" })
  @ApiOkResponse({ description: "Array of categories with phrase count." })
  async getCategories() {
    return this.service.getCategories();
  }

  @Post("categories")
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a phrasebook category" })
  @ApiCreatedResponse({ description: "Category created." })
  async createCategory(@Body() dto: CreatePhrasebookCategoryDto) {
    return this.service.createCategory(dto);
  }

  @Patch("categories/:id")
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @ApiOperation({ summary: "Update a phrasebook category" })
  @ApiParam({ name: "id" })
  @ApiOkResponse({ description: "Category updated." })
  @ApiNotFoundResponse({ description: "Category not found." })
  async updateCategory(
    @Param("id") id: string,
    @Body() dto: UpdatePhrasebookCategoryDto,
  ) {
    return this.service.updateCategory(id, dto);
  }

  @Delete("categories/:id")
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete a phrasebook category",
    description: "Deletes the category and all its phrases.",
  })
  @ApiParam({ name: "id" })
  @ApiNoContentResponse({ description: "Category deleted." })
  @ApiNotFoundResponse({ description: "Category not found." })
  async deleteCategory(@Param("id") id: string) {
    await this.service.deleteCategory(id);
  }

  // ── Phrases ──────────────────────────────────────────────────────────────

  @Get("phrases")
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @ApiOperation({ summary: "List phrasebook phrases" })
  @ApiQuery({ name: "categoryId", required: false })
  @ApiQuery({ name: "search", required: false })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ description: "Paginated phrases with words and examples." })
  async getPhrases(
    @Query("categoryId") categoryId?: string,
    @Query("search") search?: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query("limit", new DefaultValuePipe(30), ParseIntPipe) limit = 30,
  ) {
    return this.service.getPhrases({ categoryId, search, page, limit });
  }

  @Post("phrases")
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a phrasebook phrase" })
  @ApiCreatedResponse({ description: "Phrase created." })
  @ApiNotFoundResponse({ description: "Category not found." })
  async createPhrase(@Body() dto: CreatePhrasebookPhraseDto) {
    return this.service.createPhrase(dto);
  }

  @Patch("phrases/:id")
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @ApiOperation({
    summary: "Update a phrasebook phrase",
    description:
      "If words or examples arrays are provided, they fully replace the existing ones.",
  })
  @ApiParam({ name: "id" })
  @ApiOkResponse({ description: "Phrase updated." })
  @ApiNotFoundResponse({ description: "Phrase not found." })
  async updatePhrase(
    @Param("id") id: string,
    @Body() dto: UpdatePhrasebookPhraseDto,
  ) {
    return this.service.updatePhrase(id, dto);
  }

  // ── Suggestions ──────────────────────────────────────────────────────────

  @Get("suggestions")
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @ApiOperation({ summary: "List phrase suggestions from users" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ description: "Paginated suggestions with user and category info." })
  async getSuggestions(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.service.getSuggestions(page, limit);
  }

  @Delete("suggestions/:id")
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a phrase suggestion" })
  @ApiParam({ name: "id" })
  @ApiNoContentResponse({ description: "Suggestion deleted." })
  @ApiNotFoundResponse({ description: "Suggestion not found." })
  async deleteSuggestion(@Param("id") id: string) {
    await this.service.deleteSuggestion(id);
  }

  @Delete("phrases/:id")
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a phrasebook phrase" })
  @ApiParam({ name: "id" })
  @ApiNoContentResponse({ description: "Phrase deleted." })
  @ApiNotFoundResponse({ description: "Phrase not found." })
  async deletePhrase(@Param("id") id: string) {
    await this.service.deletePhrase(id);
  }
}
