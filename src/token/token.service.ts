import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";

@Injectable()
export class TokenService {
  constructor(private prisma: PrismaService) {}

  async getTokenInfo(tokenId: string) {
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
