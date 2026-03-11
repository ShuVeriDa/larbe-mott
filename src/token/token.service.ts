import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { WordProgressService } from "src/progress/word-progress/word-progress.service";

@Injectable()
export class TokenService {
  constructor(
    private prisma: PrismaService,
    private wordProgress: WordProgressService,
  ) {}

  async getTokenInfo(tokenId: string, userId: string) {
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

    return {
      tokenId: token.id,
      word: token.original,
      normalized: token.normalized,
      lemma: headword?.text ?? null,
      forms: primary?.lemma?.morphForms?.map((f) => f.form) ?? [],
      source: primary?.source ?? null,
    };
  }
}
