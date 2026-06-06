import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { ErrorCode } from "src/common/errors/error-codes";
import { UserTextTokenizerProcessor } from "./user-text-tokenizer.processor";

/**
 * Returns TextPageResponse-compatible shape for UserText pages.
 * The response is identical to TextService.getPage() so the frontend
 * ReaderPage widget works without modification.
 */
@Injectable()
export class UserTextReaderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenizer: UserTextTokenizerProcessor,
  ) {}

  private getTopLevelNodes(content: unknown): unknown[] {
    if (!content || typeof content !== "object") return [];
    const doc = content as { content?: unknown[] };
    return Array.isArray(doc.content) ? doc.content : [];
  }

  async getPage(userId: string, userTextId: string, pageNumber: number) {
    // Owner-scoped fetch
    const userText = await this.prisma.userText.findUnique({
      where: { id: userTextId },
    });

    if (!userText || userText.userId !== userId) {
      throw new NotFoundException({
        code: ErrorCode.USER_TEXT_NOT_FOUND,
        message: "UserText not found",
      });
    }

    // Lazy tokenization: run on first read if no current version exists
    const existingVersion = await this.prisma.userTextProcessingVersion.findFirst({
      where: { userTextId, isCurrent: true, status: "COMPLETED" },
      select: { id: true },
    });

    if (!existingVersion) {
      await this.tokenizer.processUserText(userTextId, userId);
    }

    // Re-fetch after potential tokenization
    const version = await this.prisma.userTextProcessingVersion.findFirst({
      where: { userTextId, isCurrent: true },
      select: { id: true },
    });

    // Split content into virtual pages
    const pages = this.tokenizer.splitIntoPages(userText.content);
    const totalPages = pages.length || 1;

    // Validate page number (1-based)
    const pageIndex = pageNumber - 1;
    if (pageIndex < 0 || pageIndex >= totalPages) {
      throw new NotFoundException({
        code: ErrorCode.PAGE_NOT_FOUND,
        message: "Page not found",
      });
    }

    const currentPage = pages[pageIndex];

    if (!version) {
      // Tokenization not yet complete (still processing) — return empty tokens
      return this.buildResponse(userText, currentPage, totalPages, pageNumber, [], 0);
    }

    // Fetch tokens for this page
    const rawTokens = await this.prisma.userTextToken.findMany({
      where: { versionId: version.id, pageIndex },
      orderBy: { position: "asc" },
      select: {
        id: true,
        position: true,
        original: true,
        normalized: true,
        vocabId: true,
        startOffset: true,
        endOffset: true,
        analyses: {
          where: { isPrimary: true },
          take: 1,
          select: { lemmaId: true },
        },
      },
    });

    const wordCount = rawTokens.filter((t) => t.normalized.length > 0).length;

    const tokens = rawTokens.map((t) => ({
      id: t.id,
      position: t.position,
      original: t.original,
      normalized: t.normalized,
      lemmaId: t.analyses[0]?.lemmaId ?? null,
      vocabId: t.vocabId ?? null,
      isKnown: t.analyses[0]?.lemmaId != null,
      userStatus: null, // No user word progress for private texts
      startOffset: t.startOffset ?? 0,
      endOffset: t.endOffset ?? 0,
    }));

    return this.buildResponse(userText, currentPage, totalPages, pageNumber, tokens, wordCount);
  }

  private buildPageContentRich(userText: { content: unknown }, pageIndex: number, totalPages: number): unknown {
    // Detect multi-page format and return the specific page's TipTap doc
    if (userText.content && typeof userText.content === "object") {
      const doc = userText.content as { content?: unknown[] };
      if (Array.isArray(doc.content) && doc.content.length === 1) {
        const first = doc.content[0] as { type?: string; attrs?: { type?: string; pages?: unknown[] } };
        if (first?.type === "multi_page_wrapper" && first?.attrs?.type === "multi-page" && Array.isArray(first.attrs.pages)) {
          const pageDoc = first.attrs.pages[pageIndex];
          return pageDoc ?? { type: "doc", content: [] };
        }
      }
    }

    // Legacy single-page or char-split: return full doc for single page
    if (totalPages === 1) return userText.content;

    // Legacy multi-page: split top-level nodes proportionally
    const nodes = this.getTopLevelNodes(userText.content);
    const nodesPerPage = Math.ceil(nodes.length / totalPages);
    const start = pageIndex * nodesPerPage;
    const end = Math.min(start + nodesPerPage, nodes.length);
    return { type: "doc", content: nodes.slice(start, end) };
  }

  private buildResponse(
    userText: { id: string; title: string; language: string; author: string | null; sourceUrl: string | null; content: unknown },
    page: { pageIndex: number; contentRaw: string },
    totalPages: number,
    pageNumber: number,
    tokens: Array<{
      id: string; position: number; original: string; normalized: string;
      lemmaId: string | null; vocabId: string | null; isKnown: boolean;
      userStatus: null; startOffset: number; endOffset: number;
    }>,
    wordCount: number,
  ) {
    // Use original TipTap JSON for contentRich — preserves all formatting
    const contentRich = this.buildPageContentRich(userText, page.pageIndex, totalPages);

    return {
      // Text metadata fields (mirrors TextPageResponse)
      id: userText.id,
      title: userText.title,
      author: userText.author ?? null,
      language: userText.language,
      level: null,
      tags: [],
      imageUrl: null,
      totalPages,
      wordCount,
      progress: 0,
      bookmarked: false,
      lastPageNumber: pageNumber,
      contentRich,
      // Page
      page: {
        id: `${userText.id}-p${pageNumber}`,
        pageNumber,
        title: null,
        contentRich,
        contentRaw: page.contentRaw,
      },
      tokens,
    };
  }
}
