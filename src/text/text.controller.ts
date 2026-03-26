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
import type { TextProgressStatus, TextSortOrder } from "./text.service";

@ApiTags("texts")
@ApiBearerAuth()
@Controller("texts")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class TextController {
  constructor(private readonly textService: TextService) {}

  @Get("tags")
  @OptionalAuth()
  @ApiOperation({
    summary: "List all tags",
    description: "Returns all available tags. Use tag IDs for filtering GET /texts.",
  })
  @ApiOkResponse({ description: "Array of { id, name }." })
  async getTags() {
    return this.textService.getAllTags();
  }

  @Get()
  @OptionalAuth()
  @ApiOperation({
    summary: "List all texts",
    description:
      "Returns a paginated list of published texts with filtering, sorting, search, progress and counters. " +
      "Filtering by language/level/tag supports multiple values (repeat the param). " +
      "Progress fields (progressPercent, progressStatus, lastOpened) are populated only when authenticated.",
  })
  @ApiQuery({ name: "language", enum: Language, isArray: true, required: false })
  @ApiQuery({ name: "level", enum: Level, isArray: true, required: false })
  @ApiQuery({ name: "tagId", type: String, isArray: true, required: false, description: "One or more tag IDs" })
  @ApiQuery({
    name: "status",
    enum: ["NEW", "IN_PROGRESS", "COMPLETED"],
    required: false,
    description: "Filter by progress status (auth required)",
  })
  @ApiQuery({
    name: "orderBy",
    enum: ["newest", "oldest", "alpha", "progress", "length", "level"],
    required: false,
    description: "Sort order. Default: newest. 'level' sorts A1→C2.",
  })
  @ApiQuery({ name: "search", required: false, description: "Search by title or author" })
  @ApiOkResponse({
    description: "{ items: Text[], counts: { total, new, inProgress, completed } }",
  })
  async getTexts(
    @Query("language") language?: Language | Language[],
    @Query("level") level?: Level | Level[],
    @Query("tagId") tagId?: string | string[],
    @Query("status") status?: TextProgressStatus,
    @Query("orderBy") orderBy?: TextSortOrder,
    @Query("search") search?: string,
    @User("id") userId?: string,
  ) {
    const languages = language ? (Array.isArray(language) ? language : [language]) : [];
    const levels = level ? (Array.isArray(level) ? level : [level]) : [];
    const tagIds = tagId ? (Array.isArray(tagId) ? tagId : [tagId]) : [];
    return this.textService.getTexts({ languages, levels, tagIds, status, orderBy, search }, userId);
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
    return this.textService.getPage(textId, parseInt(pageNumber, 10), userId);
  }

  @Get(":id")
  @OptionalAuth()
  @ApiOperation({
    summary: "Get a text by ID (all pages)",
    description:
      "Returns a single text with full details: metadata, pages list (id, pageNumber, title), tags, " +
      "wordCount, readingTime, totalPages, publishedAt, imageUrl. " +
      "When authenticated: progressPercent, lastOpened, currentPage, wordStats (known/learning/new/total).",
  })
  @ApiParam({ name: "id", description: "Unique text identifier (UUID)" })
  @ApiOkResponse({ description: "Text with metadata, pages and tags." })
  @ApiNotFoundResponse({ description: "Text with the given ID was not found." })
  async getTextById(@Param("id") textId: string, @User("id") userId: string | undefined) {
    return this.textService.getTextById(textId, userId);
  }

  @Get(":id/related")
  @OptionalAuth()
  @ApiOperation({
    summary: "Related texts",
    description:
      "Returns up to 6 published texts with the same language and matching level or tags. " +
      "When authenticated includes progressPercent per text.",
  })
  @ApiParam({ name: "id", description: "Text ID (UUID)" })
  @ApiOkResponse({ description: "Array of related texts with wordCount, readingTime, totalPages." })
  @ApiNotFoundResponse({ description: "Text with the given ID was not found." })
  async getRelatedTexts(@Param("id") textId: string, @User("id") userId: string | undefined) {
    return this.textService.getRelatedTexts(textId, userId);
  }
}
