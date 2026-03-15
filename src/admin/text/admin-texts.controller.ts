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
  ApiBody,
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
import { CreateTextDto } from "src/admin/text/dto/create.dto";
import { PatchTextDto } from "src/admin/text/dto/update.dto";
import { Admin } from "src/auth/decorators/admin.decorator";
import { User } from "src/user/decorators/user.decorator";
import { AdminTextService } from "./admin-text.service";

@ApiTags("admin/texts")
@ApiBearerAuth()
@Controller("admin/texts")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class AdminTextsController {
  constructor(private readonly adminTextService: AdminTextService) {}

  @Admin()
  @Get()
  @ApiOperation({
    summary: "List all texts for admin (admin only)",
    description:
      "Returns all texts with wordCount and publishedAt (null = draft). Requires admin role.",
  })
  @ApiOkResponse({
    description:
      "Array of texts with id, title, level, language, author, source, publishedAt, wordCount, createdAt, etc.",
  })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async getTexts() {
    return await this.adminTextService.getTextsForAdmin();
  }

  @HttpCode(201)
  @Admin()
  @Post()
  @ApiOperation({
    summary: "Create a new text (admin only)",
    description:
      "Creates a new text with title, language, level, author, source, and pages. Requires admin role.",
  })
  @ApiBody({
    description:
      "Text payload: title, language, level (optional), author, source (optional), pages (TipTap docs).",
    type: CreateTextDto,
  })
  @ApiCreatedResponse({
    description: "Text created successfully. Returns the created text.",
  })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async addNewText(@Body() dto: CreateTextDto, @User("id") userId: string) {
    return await this.adminTextService.addNewText(dto, userId);
  }

  @Admin()
  @Patch(":id")
  @ApiOperation({
    summary: "Partially update a text (admin only)",
    description:
      "Updates only the provided fields. Send only the properties you want to change. Sending `pages` replaces all pages. Requires admin role.",
  })
  @ApiParam({
    name: "id",
    description: "Unique text identifier (UUID)",
    example: "550e8400-e29b-41d4-a716-446655440000",
  })
  @ApiBody({
    description:
      "Partial payload. All fields are optional; only sent fields are updated.",
    type: PatchTextDto,
  })
  @ApiOkResponse({
    description: "Text updated successfully. Returns the updated text.",
  })
  @ApiNotFoundResponse({ description: "Text with the given ID was not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async patchText(@Param("id") textId: string, @Body() dto: PatchTextDto) {
    return await this.adminTextService.patchText(textId, dto);
  }

  @Admin()
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete a text (admin only)",
    description:
      "Permanently deletes a text and all its pages, processing versions, tokens, and progress. Requires admin role.",
  })
  @ApiParam({
    name: "id",
    description: "Unique text identifier (UUID)",
    example: "550e8400-e29b-41d4-a716-446655440000",
  })
  @ApiNoContentResponse({
    description: "Text deleted successfully.",
  })
  @ApiNotFoundResponse({ description: "Text with the given ID was not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async deleteText(@Param("id") textId: string) {
    await this.adminTextService.deleteText(textId);
  }
}
