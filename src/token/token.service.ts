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
    // 1️⃣ проверяем кэш
    const cached = this.cache.get(tokenId);

    if (cached) {
      // всё равно обновляем прогресс слова
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

    const primary =
      token.analyses.find((a) => a.isPrimary) ?? token.analyses[0];

    const lemmaId = primary?.lemmaId;

    // 🔥 ЭТАП 10
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

    // 3️⃣ сохраняем в кэш
    this.cache.set(tokenId, result);

    return result;
  }
}
