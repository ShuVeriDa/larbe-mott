import { Controller, Get, Param, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Language, Level } from "@prisma/client";
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
  @OptionalAuth()
  @ApiOperation({
    summary: "List all texts",
    description:
      "Returns a list of all published texts. Supports filtering by language and level, full-text search by title/author, and returns user progress when authenticated.",
  })
  @ApiQuery({ name: "language", enum: Language, isArray: true, required: false, description: "One or more languages. Omit for all." })
  @ApiQuery({ name: "level", enum: Level, isArray: true, required: false, description: "One or more levels. Omit for all." })
  @ApiQuery({ name: "search", required: false, description: "Search by title or author" })
  @ApiOkResponse({
    description:
      "Array of text items with wordCount, progressPercent, lastOpened.",
  })
  async getTexts(
    @Query("language") language?: Language | Language[],
    @Query("level") level?: Level | Level[],
    @Query("search") search?: string,
    @User("id") userId?: string,
  ) {
    const languages = language ? (Array.isArray(language) ? language : [language]) : [];
    const levels = level ? (Array.isArray(level) ? level : [level]) : [];
    return this.textService.getTexts({ languages, levels, search }, userId);
  }

  @Get("continue-reading")
  @ApiOperation({
    summary: "Continue reading list",
    description:
      "Returns texts the user has started but not finished (0 < progress < 100), sorted by last opened. Includes currentPage and totalPages.",
  })
  @ApiOkResponse({
    description: "Array of in-progress texts with page info and progress.",
  })
  async getContinueReading(@User("id") userId: string) {
    return this.textService.getContinueReading(userId);
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
    return this.textService.getPage(
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
    return this.textService.getTextById(textId, userId);
  }
}
