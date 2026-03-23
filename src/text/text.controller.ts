import { Controller, Get, Param } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { OptionalAuth } from "src/auth/decorators/optional-auth.decorator";
import { User } from "src/user/decorators/user.decorator";
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
  @OptionalAuth()
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
    @User("id") userId: string | undefined,
  ) {
    return await this.textService.getPage(
      textId,
      parseInt(pageNumber, 10),
      userId,
    );
  }

  @Get(":id")
  @OptionalAuth()
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
  async getTextById(@Param("id") textId: string, @User("id") userId: string | undefined) {
    return await this.textService.getTextById(textId, userId);
  }
}
