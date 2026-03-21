import { Injectable, NotFoundException } from "@nestjs/common";
import { TokenInfoCacheService } from "src/cache/token-info-cache.service";
import { TokenizerService } from "src/markup-engine/tokenizer/tokenizer.service";
import { PrismaService } from "src/prisma.service";
import { WordProgressService } from "src/progress/word-progress/word-progress.service";
import { UserEventType } from "@prisma/client";

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
        await this.prisma.userEvent.create({
          data: {
            userId,
            type: UserEventType.CLICK_WORD,
            metadata: {
              tokenId,
              lemmaId: cached.lemmaId,
              word: cached.word,
              normalized: cached.normalized,
            },
          },
        });
        if (cached.textId) {
          void this.wordProgress.saveContext(userId, cached.lemmaId, cached.textId, cached.word, tokenId);
        }
      }
      return cached;
    }

    // 2️⃣ запрос в БД
    const token = await this.prisma.textToken.findUnique({
      where: { id: tokenId },
      include: {
        version: { select: { textId: true } },
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
        textId: token.version.textId,
        translation: cachedByWord.translation ?? null,
        grammar: cachedByWord.grammar ?? null,
        baseForm: cachedByWord.baseForm ?? null,
      };
      if (result.lemmaId) {
        await this.wordProgress.registerClick(userId, result.lemmaId);
        await this.prisma.userEvent.create({
          data: {
            userId,
            type: UserEventType.CLICK_WORD,
            metadata: {
              tokenId: token.id,
              lemmaId: result.lemmaId,
              textId: token.version.textId,
              word: token.original,
              normalized: token.normalized,
            },
          },
        });
        void this.wordProgress.saveContext(userId, result.lemmaId, token.version.textId, token.original, token.id);
      }
      this.cache.set(token.id, token.versionId, token.normalized, result);
      return result;
    }

    const primary =
      token.analyses.find((a) => a.isPrimary) ?? token.analyses[0];
    const lemmaId = primary?.lemmaId;

    if (lemmaId) {
      await this.wordProgress.registerClick(userId, lemmaId);
      await this.prisma.userEvent.create({
        data: {
          userId,
          type: UserEventType.CLICK_WORD,
          metadata: {
            tokenId: token.id,
            lemmaId,
            textId: token.version.textId,
            word: token.original,
            normalized: token.normalized,
          },
        },
      });
      void this.wordProgress.saveContext(userId, lemmaId, token.version.textId, token.original, token.id);
    }

    const headword = primary?.lemma?.headwords?.[0];
    const entry = headword?.entry as { rawTranslate?: string } | undefined;
    const translation =
      entry?.rawTranslate ?? token.vocabulary?.translation ?? null;
    const result = {
      tokenId: token.id,
      word: token.original,
      normalized: token.normalized,
      textId: token.version.textId,
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
}
