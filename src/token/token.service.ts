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
import { UpdateTokenDto } from "./dto/update-token.dto";

@Injectable()
export class TokenService {
  constructor(
    private prisma: PrismaService,
    private wordProgress: WordProgressService,
    private cache: TokenInfoCacheService,
    private tokenizerService: TokenizerService,
  ) {}

  async getTokenInfo(tokenId: string, userId: string) {
    // 1️⃣ кэш по tokenId
    const cached = this.cache.get(tokenId);
    if (cached) {
      if (cached.lemmaId) {
        await this.wordProgress.registerClick(userId, cached.lemmaId);
      }
      return cached;
    }

    // 2️⃣ запрос в БД
    const token = await this.prisma.textToken.findUnique({
      where: { id: tokenId },
      include: {
        vocabulary: { select: { translation: true } },
        analyses: {
          include: {
            lemma: {
              include: {
                headwords: {
                  include: {
                    entry: { select: { rawTranslate: true } },
                  },
                },
                morphForms: true,
              },
            },
          },
        },
      },
    });

    if (!token) {
      throw new NotFoundException("Token not found");
    }

    // 3️⃣ кэш по (versionId, normalized): то же слово на другой странице — без повторного разбора
    const cachedByWord = this.cache.getByVersionNormalized(
      token.versionId,
      token.normalized,
    );
    if (cachedByWord) {
      const result = {
        ...cachedByWord,
        tokenId: token.id,
        word: token.original,
        translation: cachedByWord.translation ?? null,
        grammar: cachedByWord.grammar ?? null,
        baseForm: cachedByWord.baseForm ?? null,
      };
      if (result.lemmaId) {
        await this.wordProgress.registerClick(userId, result.lemmaId);
      }
      this.cache.set(token.id, token.versionId, token.normalized, result);
      return result;
    }

    const primary =
      token.analyses.find((a) => a.isPrimary) ?? token.analyses[0];
    const lemmaId = primary?.lemmaId;

    if (lemmaId) {
      await this.wordProgress.registerClick(userId, lemmaId);
    }

    const headword = primary?.lemma?.headwords?.[0];
    const entry = headword?.entry as { rawTranslate?: string } | undefined;
    const translation =
      entry?.rawTranslate ?? token.vocabulary?.translation ?? null;
    const result = {
      tokenId: token.id,
      word: token.original,
      normalized: token.normalized,
      lemmaId,
      lemma: headword?.text ?? null,
      forms: primary?.lemma?.morphForms?.map((f) => f.form) ?? [],
      source: primary?.source ?? null,
      translation,
      grammar: primary?.lemma?.partOfSpeech ?? null,
      baseForm: primary?.lemma?.baseForm ?? headword?.text ?? null,
    };

    this.cache.set(token.id, token.versionId, token.normalized, result);
    return result;
  }

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
}
