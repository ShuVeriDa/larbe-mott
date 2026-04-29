import { PrismaService } from "src/prisma.service";

export type LatestContext = {
  snippet: string | null;
  sourceTitle: string | null;
  sourceTextId: string;
  seenAt: Date;
};

// Один запрос на все lemmaIds + group-by-lemma в коде, чтобы не плодить N+1.
// Используется в /progress/review/due и /deck/due для подмешивания
// последнего WordContext к каждой карточке.
export async function attachLatestContexts<
  T extends { lemmaId: string | null },
>(
  prisma: PrismaService,
  userId: string,
  rows: T[],
): Promise<(T & { latestContext: LatestContext | null })[]> {
  const lemmaIds = rows
    .map((r) => r.lemmaId)
    .filter((id): id is string => Boolean(id));

  if (!lemmaIds.length) {
    return rows.map((r) => ({ ...r, latestContext: null }));
  }

  const contexts = await prisma.wordContext.findMany({
    where: { userId, lemmaId: { in: lemmaIds } },
    orderBy: { seenAt: "desc" },
    distinct: ["lemmaId"],
    select: {
      lemmaId: true,
      snippet: true,
      seenAt: true,
      textId: true,
      text: { select: { title: true } },
    },
  });

  const byLemma = new Map(contexts.map((c) => [c.lemmaId, c]));
  return rows.map((r) => {
    const ctx = r.lemmaId ? byLemma.get(r.lemmaId) : undefined;
    return {
      ...r,
      latestContext: ctx
        ? {
            snippet: ctx.snippet,
            sourceTitle: ctx.text?.title ?? null,
            sourceTextId: ctx.textId,
            seenAt: ctx.seenAt,
          }
        : null,
    };
  });
}
