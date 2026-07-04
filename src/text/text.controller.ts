import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { ChScript, Language, Level } from "@prisma/client";
import { TextScriptService } from "src/text-script/text-script.service";
import { TransliterationService } from "src/transliteration/transliteration.service";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { Auth } from "src/auth/decorators/auth.decorator";
import { OptionalAuth } from "src/auth/decorators/optional-auth.decorator";
import { User } from "src/user/decorators/user.decorator";
import { TrackingService } from "src/tracking/tracking.service";
import { GetTextsResponseDto } from "./dto/get-texts-response.dto";
import { ReportTextDto } from "./dto/report-text.dto";
import { TextService } from "./text.service";
import type { TextProgressStatus, TextSortOrder } from "./text.service";

@ApiTags("texts")
@ApiBearerAuth()
@Controller("texts")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class TextController {
  constructor(
    private readonly textService: TextService,
    private readonly tracking: TrackingService,
    private readonly textScript: TextScriptService,
    private readonly transliteration: TransliterationService,
  ) {}

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
    enum: ["newest", "oldest", "alpha", "progress", "length", "level", "popular"],
    required: false,
    description: "Sort order. Default: newest. 'level' sorts A→C. 'popular' sorts by reader count. 'length' sorts shortest first.",
  })
  @ApiQuery({ name: "search", required: false, description: "Search by title or author" })
  @ApiQuery({ name: "page", required: false, description: "Page number (default 1)" })
  @ApiQuery({ name: "limit", required: false, description: "Items per page (default 20, max 50)" })
  @ApiQuery({ name: "maxWords", required: false, description: "Filter: only texts with wordCount ≤ maxWords" })
  @ApiQuery({ name: "genreId", required: false, description: "Filter by genre ID" })
  @ApiOkResponse({
    description: "{ items: Text[], page, limit, counts: { total, new, inProgress, completed } }",
    type: GetTextsResponseDto,
  })
  async getTexts(
    @Query("language") language?: Language | Language[],
    @Query("level") level?: Level | Level[],
    @Query("tagId") tagId?: string | string[],
    @Query("status") status?: TextProgressStatus,
    @Query("orderBy") orderBy?: TextSortOrder,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("maxWords") maxWords?: string,
    @Query("genreId") genreId?: string,
    @User("id") userId?: string,
  ) {
    const languages = language ? (Array.isArray(language) ? language : [language]) : [];
    const levels = level ? (Array.isArray(level) ? level : [level]) : [];
    const tagIds = tagId ? (Array.isArray(tagId) ? tagId : [tagId]) : [];
    const parsedPage = Number.parseInt(page ?? "", 10);
    const parsedLimit = Number.parseInt(limit ?? "", 10);
    const parsedMaxWords = Number.parseInt(maxWords ?? "", 10);
    return this.textService.getTexts(
      {
        languages,
        levels,
        tagIds,
        status,
        orderBy,
        search,
        page: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
        limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20,
        maxWords: Number.isFinite(parsedMaxWords) && parsedMaxWords > 0 ? parsedMaxWords : undefined,
        genreId: genreId || undefined,
      },
      userId,
    );
  }

  @Get("continue-reading")
  @Auth()
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
  // 60 req/min ≈ 1 page/sec — realistic upper bound for a human reader
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary: "Get one page of a text (optimized)",
    description:
      "Returns text metadata, one page (content + tokens). Use this for reading: 1 page = 1 request.",
  })
  @ApiParam({ name: "id", description: "Text ID (UUID)" })
  @ApiParam({ name: "pageNumber", description: "Page number (1-based)" })
  @ApiQuery({ name: "script", enum: ChScript, required: false, description: "Return transliterated contentRich (LATIN or ARABIC). Omit for Cyrillic." })
  @ApiOkResponse({
    description: "Text metadata, page (contentRich, contentRaw), tokens for the page, progress.",
  })
  @ApiNotFoundResponse({ description: "Text or page not found." })
  async getPage(
    @Param("id", ParseUUIDPipe) textId: string,
    @Param("pageNumber", ParseIntPipe) pageNumber: number,
    @User("id") userId: string | undefined,
    @Query("script") script?: ChScript,
  ) {
    const page = await this.textService.getPage(textId, pageNumber, userId);
    if (script) {
      const scriptPage = await this.textScript.getTextPageWithScript(textId, pageNumber, script);
      if (scriptPage) {
        const nasalizedWords = this.transliteration.extractNasalizedWords(page.page.contentRich as object);
        const tokens = page.tokens.map((t) => ({
          ...t,
          displayText: this.transliteration.transliterateWord(t.original, script, nasalizedWords.has(t.original)),
        }));
        return { ...page, tokens, page: { ...page.page, contentRich: scriptPage.contentRich } };
      }
    }
    return page;
  }

  @Get("bookmarks")
  @Auth()
  @ApiOperation({
    summary: "My bookmarks",
    description: "Returns texts bookmarked by the authenticated user, sorted by bookmark date.",
  })
  @ApiOkResponse({ description: "Array of bookmarked texts with progress info." })
  async getBookmarks(@User("id") userId: string) {
    return this.textService.getBookmarks(userId);
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
  async getTextById(
    @Param("id", ParseUUIDPipe) textId: string,
    @User("id") userId: string | undefined,
    @Req() req: Request,
  ) {
    const result = await this.textService.getTextById(textId, userId);

    void this.tracking.track({
      type: "text_open",
      path: `/texts/${textId}`,
      ip: extractIp(req),
      userAgent: req.headers["user-agent"],
      userId,
      metadata: {
        textId,
        title: (result as Record<string, unknown>)?.title ?? null,
      },
    });

    return result;
  }

  @Post(":id/bookmark")
  @Auth()
  @ApiOperation({
    summary: "Toggle bookmark",
    description: "Adds or removes the text from the user's bookmarks. Returns { bookmarked: boolean }.",
  })
  @ApiParam({ name: "id", description: "Text ID (UUID)" })
  @ApiOkResponse({ description: "{ bookmarked: true } or { bookmarked: false }" })
  async toggleBookmark(@Param("id", ParseUUIDPipe) textId: string, @User("id") userId: string) {
    return this.textService.toggleBookmark(textId, userId);
  }

  @Delete(":id/progress")
  @Auth()
  @ApiOperation({
    summary: "Reset progress for a text",
    description:
      "Removes the user's UserTextProgress row for this text (resets progressPercent to 0 and clears lastOpened/completedAt). " +
      "Does not affect bookmarks or per-word progress.",
  })
  @ApiParam({ name: "id", description: "Text ID (UUID)" })
  @ApiOkResponse({ description: "{ ok: true }" })
  @ApiNotFoundResponse({ description: "Text with the given ID was not found." })
  async resetProgress(@Param("id", ParseUUIDPipe) textId: string, @User("id") userId: string) {
    return this.textService.resetProgress(textId, userId);
  }

  @Post(":id/report")
  @Auth()
  @ApiOperation({
    summary: "Report a text",
    description:
      "Creates a complaint for the text as a FeedbackThread (type=COMPLAINT, contextType=TEXT). " +
      "Returns 409 if the user already has an open complaint for this text — the error body contains threadId/ticketNumber. " +
      "The complaint category goes into FeedbackThread.contextAction; the user's comment goes into the first message.",
  })
  @ApiParam({ name: "id", description: "Text ID (UUID)" })
  @ApiBody({ type: ReportTextDto })
  @ApiCreatedResponse({
    description: "{ id, ticketNumber, status, createdAt } of the created thread.",
  })
  @ApiNotFoundResponse({ description: "Text with the given ID was not found." })
  @ApiConflictResponse({
    description: "The user already has an open complaint for this text.",
  })
  async reportText(
    @Param("id", ParseUUIDPipe) textId: string,
    @User("id") userId: string,
    @Body() dto: ReportTextDto,
  ) {
    return this.textService.reportText(textId, userId, dto);
  }

  @Get(":id/toc")
  @OptionalAuth()
  @ApiOperation({
    summary: "Get table of contents",
    description: "Returns all pages with their pageNumber and title.",
  })
  @ApiParam({ name: "id", description: "Text ID (UUID)" })
  @ApiOkResponse({ description: "Array of { pageNumber, title }." })
  @ApiNotFoundResponse({ description: "Text with the given ID was not found." })
  async getTableOfContents(
    @Param("id", ParseUUIDPipe) textId: string,
    @User("id") userId: string | undefined,
  ) {
    return this.textService.getTableOfContents(textId, userId);
  }

  @Get(":id/pages/:pageNumber/phrases")
  @OptionalAuth()
  @ApiOperation({
    summary: "Get phrase translations for a text page",
    description:
      "Returns all phrase occurrences on the given page with their translations. Used by the reader to highlight multi-word phrases.",
  })
  @ApiParam({ name: "id", description: "Text ID (UUID)" })
  @ApiParam({ name: "pageNumber", description: "Page number (1-based)" })
  @ApiOkResponse({
    description:
      "Array of { id, startTokenPosition, endTokenPosition, phrase: { id, original, translation, notes } }",
  })
  @ApiNotFoundResponse({ description: "Text or page not found." })
  async getPagePhrases(
    @Param("id", ParseUUIDPipe) textId: string,
    @Param("pageNumber", ParseIntPipe) pageNumber: number,
    @User("id") userId: string | undefined,
  ) {
    return this.textService.getPagePhrases(textId, pageNumber, userId);
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
  async getRelatedTexts(
    @Param("id", ParseUUIDPipe) textId: string,
    @User("id") userId: string | undefined,
  ) {
    return this.textService.getRelatedTexts(textId, userId);
  }
}

const extractIp = (req: Request): string => {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0].trim();
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.length > 0) return real;
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
};
