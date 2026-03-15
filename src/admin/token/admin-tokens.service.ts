import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { TokenInfoCacheService } from "src/cache/token-info-cache.service";
import { replaceInTiptapDoc } from "src/common/utils/replaceInTiptapDoc";
import { TokenizerService } from "src/markup-engine/tokenizer/tokenizer.service";
import { normalizeToken } from "src/markup-engine/tokenizer/tokenizer.utils";
import { PrismaService } from "src/prisma.service";
import { WordProgressService } from "src/progress/word-progress/word-progress.service";
import { BulkUpdateTokenItemDto } from "src/token/dto/bulk-update-token.dto";
import { UpdateTokenDto } from "src/token/dto/update-token.dto";

@Injectable()
export class AdminTokenService {
  constructor(
    private prisma: PrismaService,
    private wordProgress: WordProgressService,
    private cache: TokenInfoCacheService,
    private tokenizerService: TokenizerService,
  ) {}

  /**
   * Get token details for admin edit form. Does not use cache.
   */
  async getTokenForAdmin(tokenId: string) {
    const token = await this.prisma.textToken.findUnique({
      where: { id: tokenId },
      include: {
        vocabulary: {
          select: {
            id: true,
            normalized: true,
            translation: true,
            lemmaId: true,
            lemma: { select: { baseForm: true, partOfSpeech: true } },
          },
        },
        page: { select: { id: true, pageNumber: true } },
        version: { select: { id: true, version: true, textId: true } },
      },
    });
    if (!token) {
      throw new NotFoundException("Token not found");
    }
    return {
      id: token.id,
      versionId: token.versionId,
      pageId: token.pageId,
      pageNumber: token.page?.pageNumber ?? null,
      position: token.position,
      original: token.original,
      normalized: token.normalized,
      startOffset: token.startOffset ?? null,
      endOffset: token.endOffset ?? null,
      status: token.status,
      vocabId: token.vocabId,
      vocabulary: token.vocabulary
        ? {
            id: token.vocabulary.id,
            normalized: token.vocabulary.normalized,
            translation: token.vocabulary.translation,
            baseForm: token.vocabulary.lemma?.baseForm ?? null,
            partOfSpeech: token.vocabulary.lemma?.partOfSpeech ?? null,
          }
        : null,
    };
  }

  /**
   * Mass update of tokens (admin). Each item is applied via the same logic as updateToken.
   * Returns successful updates and per-item errors (e.g. token not found, invalid vocabId).
   */
  async updateTokensBulk(items: BulkUpdateTokenItemDto[]): Promise<{
    updated: Awaited<ReturnType<AdminTokenService["getTokenForAdmin"]>>[];
    errors: { tokenId: string; message: string }[];
  }> {
    const updated: Awaited<
      ReturnType<AdminTokenService["getTokenForAdmin"]>
    >[] = [];
    const errors: { tokenId: string; message: string }[] = [];

    for (const item of items) {
      const dto: UpdateTokenDto = {
        original: item.original,
        normalized: item.normalized,
        vocabId: item.vocabId,
      };
      const hasUpdate =
        dto.original !== undefined ||
        dto.normalized !== undefined ||
        dto.vocabId !== undefined;

      if (!hasUpdate) {
        errors.push({
          tokenId: item.tokenId,
          message:
            "No fields to update (provide original, normalized, or vocabId)",
        });
        continue;
      }

      try {
        const result = await this.updateToken(item.tokenId, dto);
        updated.push(result);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        errors.push({ tokenId: item.tokenId, message });
      }
    }

    return { updated, errors };
  }

  /**
   * Update a single token (admin). If original is changed, updates the word in the
   * page content (contentRaw + contentRich) and resyncs all tokens on the page.
   * Does not run full re-tokenization of the text.
   */
  async updateToken(tokenId: string, dto: UpdateTokenDto) {
    const token = await this.prisma.textToken.findUnique({
      where: { id: tokenId },
      select: {
        id: true,
        versionId: true,
        normalized: true,
        vocabId: true,
      },
    });
    if (!token) {
      throw new NotFoundException("Token not found");
    }

    if (dto.vocabId !== undefined && dto.vocabId !== null) {
      const vocab = await this.prisma.textVocabulary.findUnique({
        where: { id: dto.vocabId },
        select: { versionId: true },
      });
      if (!vocab) {
        throw new BadRequestException("TextVocabulary not found");
      }
      if (vocab.versionId !== token.versionId) {
        throw new BadRequestException(
          "Vocabulary entry must belong to the same text version as the token",
        );
      }
    }

    if (dto.original !== undefined) {
      await this.replaceTokenInPageContent(tokenId, dto.original);
    }

    const data: {
      original?: string;
      normalized?: string;
      vocabId?: string | null;
    } = {};
    if (dto.original !== undefined) data.original = dto.original;
    if (dto.normalized !== undefined) data.normalized = dto.normalized;
    if (dto.vocabId !== undefined) data.vocabId = dto.vocabId;

    const updated = await this.prisma.textToken.update({
      where: { id: tokenId },
      data,
    });

    this.cache.deleteByTokenId(tokenId);
    this.cache.deleteByVersionNormalized(token.versionId, token.normalized);
    if (updated.normalized !== token.normalized) {
      this.cache.deleteByVersionNormalized(token.versionId, updated.normalized);
    }

    return this.getTokenForAdmin(updated.id);
  }

  /**
   * Replaces one word in the page content (contentRaw + contentRich) and resyncs
   * all tokens on that page. Used when admin changes token.original.
   */
  private async replaceTokenInPageContent(
    tokenId: string,
    newOriginal: string,
  ): Promise<void> {
    const token = await this.prisma.textToken.findUnique({
      where: { id: tokenId },
      select: {
        id: true,
        pageId: true,
        position: true,
        startOffset: true,
        endOffset: true,
        versionId: true,
      },
    });
    if (!token?.pageId) return;

    const page = await this.prisma.textPage.findUnique({
      where: { id: token.pageId },
      select: { id: true, contentRaw: true, contentRich: true },
    });
    if (!page) return;

    let start = token.startOffset ?? null;
    let end = token.endOffset ?? null;
    if (start === null || end === null) {
      const pageTokens = await this.prisma.textToken.findMany({
        where: { pageId: token.pageId },
        orderBy: { position: "asc" },
        select: { id: true, position: true },
      });
      const localIndex = pageTokens.findIndex((t) => t.id === tokenId);
      if (localIndex < 0) return;
      const withOffsets = this.tokenizerService.tokenizeWithOffsets(
        page.contentRaw,
      );
      if (localIndex >= withOffsets.length) return;
      start = withOffsets[localIndex].startOffset;
      end = withOffsets[localIndex].endOffset;
    }

    const newContentRaw =
      page.contentRaw.slice(0, start) +
      newOriginal +
      page.contentRaw.slice(end);
    const newContentRich = replaceInTiptapDoc(
      page.contentRich,
      start,
      end,
      newOriginal,
    ) as Prisma.InputJsonValue;

    await this.prisma.textPage.update({
      where: { id: page.id },
      data: { contentRaw: newContentRaw, contentRich: newContentRich },
    });

    const newTokens = this.tokenizerService.tokenizeWithOffsets(newContentRaw);
    const pageTokens = await this.prisma.textToken.findMany({
      where: { pageId: token.pageId },
      orderBy: { position: "asc" },
      select: { id: true, position: true, normalized: true },
    });

    if (newTokens.length !== pageTokens.length) {
      return;
    }

    for (let i = 0; i < pageTokens.length; i++) {
      const t = pageTokens[i];
      const nt = newTokens[i];
      await this.prisma.textToken.update({
        where: { id: t.id },
        data: {
          original: nt.value,
          normalized: normalizeToken(nt.value),
          startOffset: nt.startOffset,
          endOffset: nt.endOffset,
        },
      });
      this.cache.deleteByTokenId(t.id);
      this.cache.deleteByVersionNormalized(token.versionId, t.normalized);
    }
  }
}
