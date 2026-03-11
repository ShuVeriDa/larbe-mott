import { Injectable, NotFoundException } from "@nestjs/common";
import { TokenInfoCacheService } from "src/cache/token-info-cache.service";
import { PrismaService } from "src/prisma.service";
import { WordProgressService } from "src/progress/word-progress/word-progress.service";

@Injectable()
export class TokenService {
  constructor(
    private prisma: PrismaService,
    private wordProgress: WordProgressService,
    private cache: TokenInfoCacheService,
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
        analyses: {
          include: {
            lemma: {
              include: {
                headwords: true,
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
    const result = {
      tokenId: token.id,
      word: token.original,
      normalized: token.normalized,
      lemmaId,
      lemma: headword?.text ?? null,
      forms: primary?.lemma?.morphForms?.map((f) => f.form) ?? [],
      source: primary?.source ?? null,
    };

    this.cache.set(token.id, token.versionId, token.normalized, result);
    return result;
  }
}
