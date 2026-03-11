import { Injectable } from "@nestjs/common";

import { Prisma } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { normalizeToken } from "../tokenizer/tokenizer.utils";
import { MorphologyCleaner } from "./morphology-cleaner.service";

@Injectable()
export class MorphologyImporter {
  constructor(
    private prisma: PrismaService,
    private cleaner: MorphologyCleaner,
  ) {}

  async importDictionary(entries: any[]) {
    const batch: Prisma.MorphFormCreateManyInput[] = [];

    for (const entry of entries) {
      const lemma = await this.findLemma(entry);

      if (!lemma) continue;

      const forms = this.extractForms(entry);

      for (const form of forms) {
        const normalized = normalizeToken(form);

        batch.push({
          form,
          normalized,
          lemmaId: lemma.id,
          entryId: entry.id ?? null,
        });

        if (batch.length >= 1000) {
          await this.flush(batch);
        }
      }
    }

    await this.flush(batch);
  }

  private async flush(batch: any[]) {
    if (!batch.length) return;

    await this.prisma.morphForm.createMany({
      data: batch,
      skipDuplicates: true,
    });

    batch.length = 0;
  }

  private extractForms(entry: any): string[] {
    const translate = entry.translate || "";

    const match = translate.match(/<b><i>(.*?)<\/i><\/b>/);

    if (!match) return [];

    return this.cleaner.splitForms(match[1]);
  }

  private async findLemma(entry: any) {
    const word = entry.word?.trim();

    if (!word) return null;

    return this.prisma.lemma.findFirst({
      where: {
        normalized: normalizeToken(word),
      },
    });
  }
}
