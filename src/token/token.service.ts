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

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private prisma: PrismaService,
    private wordProgress: WordProgressService,
    private cache: TokenInfoCacheService,
    private tokenizerService: TokenizerService,
  ) {}

  async getTokenInfo(tokenId: string, userId: string | undefined) {
    // Enforce maxTranslationsPerDay plan limit
    if (userId) {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      const [translationsToday, subscription] = await Promise.all([
        this.prisma.userEvent.count({
          where: { userId, type: UserEventType.CLICK_WORD, createdAt: { gte: todayStart } },
        }),
        this.prisma.subscription.findFirst({
          where: {
            userId,
            status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
          },
          include: { plan: true },
          orderBy: { startDate: "desc" },
        }),
      ]);

      const planLimits = subscription?.plan?.limits as Record<string, number> | null;
      const maxTranslationsPerDay = planLimits?.maxTranslationsPerDay ?? 50;
      if (translationsToday >= maxTranslationsPerDay) {
        throw new ForbiddenException(
          `Daily translation limit of ${maxTranslationsPerDay} reached. Upgrade your plan for more.`,
        );
      }
    }

    // 1️⃣ кэш по tokenId
    const cached = await this.cache.get(tokenId);
    if (cached) {
      if (userId && cached.lemmaId) {
        // Побочные эффекты не блокируют ответ — fire-and-forget
        this.runInBackground(
          this.wordProgress.registerClick(userId, cached.lemmaId),
          "registerClick(cached)",
        );
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
        this.runInBackground(
          this.wordProgress.registerClick(userId, result.lemmaId),
          "registerClick(cachedByWord)",
        );
        this.runInBackground(this.prisma.userEvent.create({
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
        }), "userEvent.create(cachedByWord)");
        this.runInBackground(
          this.wordProgress.saveContext(
            userId,
            result.lemmaId,
            token.version.textId,
            token.original,
            token.id,
          ),
          "saveContext(cachedByWord)",
        );
      }
      await this.cache.set(token.id, token.versionId, token.normalized, result);
      return result;
    }

    const primary =
      token.analyses.find((a) => a.isPrimary) ?? token.analyses[0];
    const lemmaId = primary?.lemmaId;

    if (userId && lemmaId) {
      this.runInBackground(
        this.wordProgress.registerClick(userId, lemmaId),
        "registerClick(db)",
      );
      this.runInBackground(this.prisma.userEvent.create({
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
      }), "userEvent.create(db)");
      this.runInBackground(
        this.wordProgress.saveContext(
          userId,
          lemmaId,
          token.version.textId,
          token.original,
          token.id,
        ),
        "saveContext(db)",
      );
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

  private runInBackground(promise: Promise<unknown>, operation: string): void {
    void promise.catch((error) => {
      this.logger.warn(
        `${operation} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }
}
