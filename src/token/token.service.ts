import { Injectable, NotFoundException } from "@nestjs/common";
import { TokenInfoCacheService } from "src/cache/token-info-cache.service";
import { parseTranslation } from "src/markup-engine/online-dictionary/translation-parser";
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

  async getTokenInfo(tokenId: string, userId: string | undefined) {
    // 1️⃣ кэш по tokenId
    const cached = await this.cache.get(tokenId);
    if (cached) {
      if (userId && cached.lemmaId) {
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
                morphForms: { select: { form: true, normalized: true, grammarTag: true } },
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
    const cachedByWord = await this.cache.getByVersionNormalized(
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
        tranAlt: cachedByWord.tranAlt ?? null,
        grammar: cachedByWord.grammar ?? null,
        baseForm: cachedByWord.baseForm ?? null,
        tags: cachedByWord.tags ?? [],
      };
      if (userId && result.lemmaId) {
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
      await this.cache.set(token.id, token.versionId, token.normalized, result);
      return result;
    }

    const primary =
      token.analyses.find((a) => a.isPrimary) ?? token.analyses[0];
    const lemmaId = primary?.lemmaId;

    if (userId && lemmaId) {
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
    const rawTranslation = entry?.rawTranslate ?? token.vocabulary?.translation ?? null;
    const parsedTranslation = parseTranslation(rawTranslation);

    // grammarTag from the MorphForm matching this token's normalized form
    const matchingForm = primary?.lemma?.morphForms?.find(
      (f) => f.normalized === token.normalized,
    );
    const grammarTag = matchingForm?.grammarTag ?? null;
    const partOfSpeech = primary?.lemma?.partOfSpeech ?? null;
    const tags: string[] = [partOfSpeech, grammarTag].filter((t): t is string => t !== null);

    const result = {
      tokenId: token.id,
      word: token.original,
      normalized: token.normalized,
      textId: token.version.textId,
      lemmaId,
      lemma: headword?.text ?? null,
      forms: primary?.lemma?.morphForms?.map((f) => f.form) ?? [],
      source: primary?.source ?? null,
      translation: parsedTranslation?.main ?? rawTranslation,
      tranAlt: parsedTranslation?.alt ?? null,
      grammar: partOfSpeech,
      baseForm: primary?.lemma?.baseForm ?? headword?.text ?? null,
      tags,
    };

    await this.cache.set(token.id, token.versionId, token.normalized, result);
    return result;
  }
}
