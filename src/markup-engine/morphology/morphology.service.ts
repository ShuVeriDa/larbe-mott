import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { normalizeToken } from "../tokenizer/tokenizer.utils";
import { MorphologyRuleEngine } from "./rule-engine.service";

@Injectable()
export class MorphologyService {
  constructor(
    private prisma: PrismaService,
    private rules: MorphologyRuleEngine,
  ) {}

  async analyze(word: string) {
    const normalized = normalizeToken(word);

    // 1️⃣ direct MorphForm lookup
    const form = await this.prisma.morphForm.findFirst({
      where: { normalized },
      include: { lemma: true },
    });

    if (form) return form;

    // 2️⃣ noun suffix stripping
    const stem = this.rules.stripSuffix(normalized);

    if (stem !== normalized) {
      const lemma = await this.prisma.lemma.findFirst({
        where: { normalized: stem },
      });

      if (lemma) return lemma;
    }

    // 3️⃣ plural detection
    const pluralStem = this.rules.detectPlural(normalized);

    if (pluralStem) {
      const lemma = await this.prisma.lemma.findFirst({
        where: { normalized: pluralStem },
      });

      if (lemma) return lemma;
    }

    // 4️⃣ verb detection
    const verbStem = this.rules.detectVerb(normalized);

    if (verbStem) {
      const lemma = await this.prisma.lemma.findFirst({
        where: { normalized: verbStem },
      });

      if (lemma) return lemma;
    }

    return null;
  }
}
