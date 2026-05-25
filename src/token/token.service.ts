import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { SubscriptionStatus, UserEventType } from "@prisma/client";
import { TokenInfoCacheService } from "src/cache/token-info-cache.service";
import { parseTranslation } from "src/markup-engine/online-dictionary/translation-parser";
import { TokenizerService } from "src/markup-engine/tokenizer/tokenizer.service";
import { PrismaService } from "src/prisma.service";
import { WordProgressService } from "src/progress/word-progress/word-progress.service";
import { RedisService } from "src/redis/redis.service";

// Cached plan limit per user: { limit: number (-1 = unlimited) }. TTL 10 min — plan changes are rare.
const PLAN_LIMIT_KEY = (userId: string) => `plan-limit:${userId}`;
const PLAN_LIMIT_TTL = 600;

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private prisma: PrismaService,
    private wordProgress: WordProgressService,
    private cache: TokenInfoCacheService,
    private tokenizerService: TokenizerService,
    private redis: RedisService,
  ) {}

  private async getTranslationsPerDay(userId: string): Promise<number> {
    const cached = await this.redis.get(PLAN_LIMIT_KEY(userId));
    if (cached !== null) return parseInt(cached, 10);

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
      },
      select: { plan: { select: { limits: true } } },
      orderBy: { startDate: "desc" },
    });

    const planLimits = subscription?.plan?.limits as Record<string, number> | null;
    const limit = planLimits?.translationsPerDay ?? 50;
    await this.redis.set(PLAN_LIMIT_KEY(userId), String(limit), "EX", PLAN_LIMIT_TTL);
    return limit;
  }

  async getTokenInfo(tokenId: string, userId: string | undefined) {
    // Enforce translationsPerDay plan limit (-1 = unlimited)
    if (userId) {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      const [translationsToday, translationsPerDay] = await Promise.all([
        this.prisma.userEvent.count({
          where: { userId, type: UserEventType.CLICK_WORD, createdAt: { gte: todayStart } },
        }),
        this.getTranslationsPerDay(userId),
      ]);

      if (translationsPerDay !== -1 && translationsToday >= translationsPerDay) {
        throw new ForbiddenException(
          `Daily translation limit of ${translationsPerDay} reached. Upgrade your plan for more.`,
        );
      }
    }

    // 1️⃣ кэш по tokenId
    const cached = await this.cache.get(tokenId);
    if (cached) {
      if (userId && cached.lemmaId) {
        this.runInBackground(this.prisma.userEvent.create({
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
        }), "userEvent.create(cached)");
        if (cached.textId) {
          this.runInBackground(
            this.wordProgress.saveContext(
              userId,
              cached.lemmaId,
              cached.textId,
              cached.word,
              tokenId,
            ),
            "saveContext(cached)",
          );
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
                morphForms: { select: { form: true, normalized: true, grammarTag: true, translation: true } },
              },
            },
          },
        },
      },
    });

    if (!token) {
      throw new NotFoundException("Token not found");
    }

    // 3️⃣ кэш по (versionId, normalized): то же слово на другой странице — без повторного разбора.
    // Пропускаем если у этого токена есть ADMIN-аннотация — она может отличаться от других вхождений.
    const hasAdminAnnotation = token.analyses.some((a) => a.source === "ADMIN");
    if (!hasAdminAnnotation) {
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
        if (userId) {
          if (result.lemmaId) {
            this.runInBackground(
              this.wordProgress.saveContext(userId, result.lemmaId, token.version.textId, token.original, token.id),
              "saveContext(cachedByWord)",
            );
          }
          this.runInBackground(this.prisma.userEvent.create({
            data: {
              userId,
              type: UserEventType.CLICK_WORD,
              metadata: {
                tokenId: token.id,
                lemmaId: result.lemmaId ?? null,
                textId: token.version.textId,
                word: token.original,
                normalized: token.normalized,
              },
            },
          }), "userEvent.create(cachedByWord)");
        }
        await this.cache.set(token.id, token.versionId, token.normalized, result);
        return result;
      }
    }

    const primary =
      token.analyses.find((a) => a.isPrimary) ?? token.analyses[0];
    const lemmaId = primary?.lemmaId;

    const headword = primary?.lemma?.headwords?.[0];
    const entry = headword?.entry as { rawTranslate?: string } | undefined;

    // grammarTag and form-specific translation from the MorphForm matching this token.
    // MorphForm may not exist (token annotated via batchAnnotate without global MorphForm),
    // so fall back to a direct DB lookup when not found in the preloaded relation.
    const matchingForm = primary?.lemma?.morphForms?.find(
      (f) => f.normalized === token.normalized,
    );
    const grammarTag = matchingForm?.grammarTag ?? null;

    let formTranslation: string | null = matchingForm?.translation ?? null;
    if (formTranslation === null && hasAdminAnnotation && primary?.lemmaId) {
      const directMorphForm = await this.prisma.morphForm.findUnique({
        where: { normalized_lemmaId: { normalized: token.normalized, lemmaId: primary.lemmaId } },
        select: { translation: true },
      });
      formTranslation = directMorphForm?.translation ?? null;
    }

    // Lemma translation: from headwords → DictionaryCache[lemma] → DictionaryCache[token]
    let rawLemmaTranslation = entry?.rawTranslate ?? token.vocabulary?.translation ?? null;
    if (!rawLemmaTranslation && primary?.lemma) {
      const lemmaNormalized = primary.lemma.normalized;
      const lookupKeys = [...new Set([lemmaNormalized, token.normalized].filter(Boolean))];
      const cacheRows = await this.prisma.dictionaryCache.findMany({
        where: { normalized: { in: lookupKeys } },
        select: { normalized: true, translation: true },
      });
      const cacheMap = new Map(cacheRows.map((r) => [r.normalized, r.translation]));
      rawLemmaTranslation = cacheMap.get(lemmaNormalized) ?? cacheMap.get(token.normalized) ?? null;
    }

    // Main translation shown to user: form-specific takes priority over lemma translation
    const rawTranslation = formTranslation ?? rawLemmaTranslation;
    const parsedTranslation = parseTranslation(rawTranslation);

    // lemmaTranslation is always the lemma's own translation (shown as secondary in popup)
    const parsedLemmaTranslation = parseTranslation(rawLemmaTranslation);
    const lemmaTranslation = formTranslation
      ? (parsedLemmaTranslation?.main ?? rawLemmaTranslation)
      : null;

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
      lemmaTranslation,
      grammar: partOfSpeech,
      baseForm: primary?.lemma?.baseForm ?? headword?.text ?? null,
      tags,
    };

    // ADMIN-аннотированные токены кэшируем только по tokenId —
    // их аннотация уникальна для этого вхождения и не должна распространяться на другие.
    if (hasAdminAnnotation) {
      await this.cache.setByTokenIdOnly(token.id, result);
    } else {
      await this.cache.set(token.id, token.versionId, token.normalized, result);
    }

    if (userId) {
      if (lemmaId) {
        this.runInBackground(
          this.wordProgress.saveContext(userId, lemmaId, token.version.textId, token.original, token.id),
          "saveContext(db)",
        );
      }
      this.runInBackground(this.prisma.userEvent.create({
        data: {
          userId,
          type: UserEventType.CLICK_WORD,
          metadata: {
            tokenId: token.id,
            lemmaId: lemmaId ?? null,
            textId: token.version.textId,
            word: token.original,
            normalized: token.normalized,
          },
        },
      }), "userEvent.create(db)");
    }

    return result;
  }

  private runInBackground(promise: Promise<unknown>, operation: string): void {
    void promise.catch((error) => {
      this.logger.warn(
        `${operation} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }
}
