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
import { Admin } from "src/auth/decorators/admin.decorator";
import { Auth } from "src/auth/decorators/auth.decorator";
import { User } from "src/user/decorators/user.decorator";
import { CreateTextDto } from "./dto/create.dto";
import { PatchTextDto } from "./dto/update.dto";
import { TextService } from "./text.service";

@ApiTags("texts")
@ApiBearerAuth()
@Controller("texts")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class TextController {
  constructor(private readonly textService: TextService) {}

  @Get()
  @ApiOperation({
    summary: "List all texts",
    description:
      "Returns a list of all texts available to the authenticated user.",
  })
  @ApiOkResponse({
    description:
      "Array of text items (id, title, language, level, author, etc.).",
  })
  async getTexts() {
    return await this.textService.getTexts();
  }

  @Get(":id/pages/:pageNumber")
  @Auth()
  @ApiOperation({
    summary: "Get one page of a text (optimized)",
    description:
      "Returns text metadata, one page (content + tokens). Use this for reading: 1 page = 1 request.",
  })
  @ApiParam({ name: "id", description: "Text ID (UUID)" })
  @ApiParam({ name: "pageNumber", description: "Page number (1-based)" })
  @ApiOkResponse({
    description: "Text metadata, page (contentRich, contentRaw), tokens for the page, progress.",
  })
  @ApiNotFoundResponse({ description: "Text or page not found." })
  async getPage(
    @Param("id") textId: string,
    @Param("pageNumber") pageNumber: string,
    @User("id") userId: string,
  ) {
    return await this.textService.getPage(
      textId,
      parseInt(pageNumber, 10),
      userId,
    );
  }

  @Get(":id")
  @Auth()
  @ApiOperation({
    summary: "Get a text by ID (all pages)",
    description: "Returns a single text with full details including all pages.",
  })
  @ApiParam({
    name: "id",
    description: "Unique text identifier (UUID)",
    example: "550e8400-e29b-41d4-a716-446655440000",
  })
  @ApiOkResponse({
    description: "Text with metadata and pages (TipTap content).",
  })
  @ApiNotFoundResponse({ description: "Text with the given ID was not found." })
  async getTextById(@Param("id") textId: string, @User("id") userId: string) {
    return await this.textService.getTextById(textId, userId);
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
    return await this.textService.addNewText(dto, userId);
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
    return await this.textService.patchText(textId, dto);
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
    await this.textService.deleteText(textId);
  }
}
