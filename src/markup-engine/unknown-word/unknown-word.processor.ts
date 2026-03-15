import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "src/prisma.service";

@Injectable()
export class UnknownWordProcessor {
  constructor(private prisma: PrismaService) {}

  async analyzeVersion(versionId: string) {
    // 1️⃣ получить все токены без анализа
    const tokens = await this.prisma.textToken.findMany({
      where: {
        versionId,
        analyses: { none: {} },
      },
      select: {
        normalized: true,
      },
    });

    if (!tokens.length) return;

    // 2️⃣ посчитать частоту слов
    const counts = new Map<string, number>();

    for (const token of tokens) {
      counts.set(token.normalized, (counts.get(token.normalized) ?? 0) + 1);
    }

    const words = [...counts.keys()];

    // 3️⃣ найти существующие unknown words
    const existing = await this.prisma.unknownWord.findMany({
      where: {
        normalized: { in: words },
      },
      select: {
        normalized: true,
      },
    });

    const existingSet = new Set(existing.map((e) => e.normalized));

    const createRows: {
      word: string;
      normalized: string;
      seenCount: number;
    }[] = [];

    const updateRows: {
      normalized: string;
      count: number;
    }[] = [];

    for (const [word, count] of counts) {
      if (existingSet.has(word)) {
        updateRows.push({ normalized: word, count });
      } else {
        createRows.push({
          word,
          normalized: word,
          seenCount: count,
        });
      }
    }

    // 4️⃣ batch insert новых слов
    if (createRows.length) {
      await this.prisma.unknownWord.createMany({
        data: createRows,
        skipDuplicates: true,
      });
    }

    // 5️⃣ batch update существующих — один массовый UPDATE вместо N отдельных
    if (updateRows.length) {
      const values = Prisma.join(
        updateRows.map((r) => Prisma.sql`(${r.normalized}, ${r.count})`),
        ", ",
      );
      await this.prisma.$executeRaw`
        UPDATE unknown_word uw
        SET "seenCount" = uw."seenCount" + v.count, "lastSeen" = now()
        FROM (VALUES ${values}) AS v(normalized, count)
        WHERE uw.normalized = v.normalized
      `;
    }
  }

  /**
   * Записать неизвестное слово при неудачном lookup (клик по слову или ввод).
   * Вызывается тихо, не влияет на ответ пользователю.
   */
  async recordFromLookup(normalized: string): Promise<void> {
    if (!normalized?.trim()) return;
    const n = normalized.trim();
    await this.prisma.unknownWord.upsert({
      where: { normalized: n },
      create: { word: n, normalized: n, seenCount: 1 },
      update: {
        seenCount: { increment: 1 },
        lastSeen: new Date(),
      },
    });
  }
}
