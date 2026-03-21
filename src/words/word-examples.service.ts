import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";

const SNIPPET_RADIUS = 6; // токенов до и после слова
const MAX_EXAMPLES = 10; // максимум примеров в ответе

@Injectable()
export class WordExamplesService {
  constructor(private prisma: PrismaService) {}

  async getExamples(lemmaId: string) {
    const lemma = await this.prisma.lemma.findUnique({ where: { id: lemmaId } });
    if (!lemma) throw new NotFoundException("Lemma not found");

    // Находим токены, связанные с леммой через TokenAnalysis
    const analyses = await this.prisma.tokenAnalysis.findMany({
      where: { lemmaId, isPrimary: true },
      select: {
        token: {
          select: {
            id: true,
            original: true,
            pageId: true,
            position: true,
            version: {
              select: {
                text: {
                  select: { id: true, title: true, language: true },
                },
              },
            },
          },
        },
      },
      take: MAX_EXAMPLES,
      distinct: ["tokenId"],
    });

    const examples = await Promise.all(
      analyses
        .filter((a) => a.token.pageId !== null)
        .map(async (a) => {
          const { token } = a;

          const neighbors = await this.prisma.textToken.findMany({
            where: {
              pageId: token.pageId!,
              position: {
                gte: token.position - SNIPPET_RADIUS,
                lte: token.position + SNIPPET_RADIUS,
              },
            },
            orderBy: { position: "asc" },
            select: { original: true, position: true },
          });

          const snippet = neighbors
            .map((n) => n.original)
            .join(" ")
            .trim();

          return {
            word: token.original,
            snippet,
            text: a.token.version.text,
          };
        }),
    );

    // Дедупликация по тексту — один пример на текст
    const seen = new Set<string>();
    return examples.filter((e) => {
      if (seen.has(e.text.id)) return false;
      seen.add(e.text.id);
      return true;
    });
  }
}
