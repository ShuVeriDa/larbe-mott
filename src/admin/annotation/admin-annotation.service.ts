import { Injectable, NotFoundException } from "@nestjs/common";
import { AnalysisSource, Language } from "@prisma/client";
import { TokenInfoCacheService } from "src/cache/token-info-cache.service";
import { OnlineDictionaryService } from "src/markup-engine/online-dictionary/online-dictionary.service";
import { PrismaService } from "src/prisma.service";

export type AnnotateScope = "local" | "global";

const SNIPPET_WINDOW = 6; // tokens on each side

@Injectable()
export class AdminAnnotationService {
  constructor(
    private prisma: PrismaService,
    private cache: TokenInfoCacheService,
    private onlineDictionary: OnlineDictionaryService,
  ) {}

  async searchLemmas(q: string, language: Language = Language.CHE, limit = 20) {
    if (!q?.trim()) return [];

    const term = q.trim();
    const cap = Math.min(limit, 50);

    const dbLemmas = await this.prisma.lemma.findMany({
      where: {
        OR: [
          { baseForm: { contains: term, mode: "insensitive" } },
          { normalized: { contains: term.toLowerCase(), mode: "insensitive" } },
          { headwords: { some: { text: { contains: term, mode: "insensitive" } } } },
          { headwords: { some: { normalized: { contains: term.toLowerCase(), mode: "insensitive" } } } },
        ],
      },
      take: cap,
      include: {
        headwords: {
          where: { isPrimary: true },
          take: 1,
          include: { entry: { select: { rawTranslate: true } } },
        },
      },
      orderBy: [{ frequency: "desc" }, { baseForm: "asc" }],
    });

    const results: { id: string; baseForm: string; normalized: string; partOfSpeech: string | null; translation: string | null }[] = dbLemmas.map((lemma) => ({
      id: lemma.id,
      baseForm: lemma.baseForm,
      normalized: lemma.normalized,
      partOfSpeech: lemma.partOfSpeech,
      translation: lemma.headwords[0]?.entry?.rawTranslate ?? null,
    }));

    if (results.length < cap) {
      const online = await this.onlineDictionary.lookupWord(term, language);
      if (online) {
        const normalized = term.toLowerCase();
        const alreadyInResults = results.some((r) => r.normalized === normalized);

        if (!alreadyInResults) {
          const lemma = await this.prisma.lemma.upsert({
            where: { normalized_language: { normalized, language } },
            create: {
              baseForm: online.baseForm ?? term,
              normalized,
              language,
              partOfSpeech: online.grammar ?? null,
            },
            update: {},
            select: { id: true, baseForm: true, normalized: true, partOfSpeech: true },
          });

          results.push({
            id: lemma.id,
            baseForm: lemma.baseForm,
            normalized: lemma.normalized,
            partOfSpeech: lemma.partOfSpeech,
            translation: online.translation ?? null,
          });
        }
      }
    }

    return results;
  }

  async getTokenOccurrences(normalized: string, textId: string) {
    const version = await this.prisma.textProcessingVersion.findFirst({
      where: { textId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!version) return [];

    const occurrences = await this.prisma.textToken.findMany({
      where: { versionId: version.id, normalized },
      select: { id: true, pageId: true, position: true, original: true },
      orderBy: [{ pageId: "asc" }, { position: "asc" }],
    });
    if (!occurrences.length) return [];

    // Group position ranges by page — one context query per page
    const pageRanges = new Map<string, { min: number; max: number }>();
    for (const occ of occurrences) {
      if (!occ.pageId) continue;
      const existing = pageRanges.get(occ.pageId);
      if (existing) {
        existing.min = Math.min(existing.min, occ.position - SNIPPET_WINDOW);
        existing.max = Math.max(existing.max, occ.position + SNIPPET_WINDOW);
      } else {
        pageRanges.set(occ.pageId, {
          min: occ.position - SNIPPET_WINDOW,
          max: occ.position + SNIPPET_WINDOW,
        });
      }
    }

    const pageContexts = new Map<string, Map<number, string>>();
    await Promise.all(
      [...pageRanges.entries()].map(async ([pageId, { min, max }]) => {
        const tokens = await this.prisma.textToken.findMany({
          where: { pageId, position: { gte: min, lte: max } },
          select: { position: true, original: true },
          orderBy: { position: "asc" },
        });
        pageContexts.set(pageId, new Map(tokens.map((t) => [t.position, t.original])));
      }),
    );

    return occurrences.map((occ) => {
      const ctx = occ.pageId ? pageContexts.get(occ.pageId) : null;
      const before: string[] = [];
      const after: string[] = [];
      if (ctx) {
        for (let p = occ.position - SNIPPET_WINDOW; p < occ.position; p++) {
          const w = ctx.get(p);
          if (w) before.push(w);
        }
        for (let p = occ.position + 1; p <= occ.position + SNIPPET_WINDOW; p++) {
          const w = ctx.get(p);
          if (w) after.push(w);
        }
      }
      return { tokenId: occ.id, word: occ.original, before: before.join(" "), after: after.join(" ") };
    });
  }

  async batchAnnotateWithMorphForm(
    tokenIds: string[],
    normalized: string,
    lemmaId: string,
    translation?: string,
  ) {
    const lemma = await this.prisma.lemma.findUnique({
      where: { id: lemmaId },
      select: { id: true, baseForm: true },
    });
    if (!lemma) throw new NotFoundException("Lemma not found");

    await this.prisma.$transaction([
      // Create/update the global MorphForm for future tokenizations
      this.prisma.morphForm.upsert({
        where: { normalized_lemmaId: { normalized, lemmaId } },
        create: { form: normalized, normalized, lemmaId, translation: translation ?? null },
        update: { translation: translation ?? null },
      }),
      // Demote existing primary analyses for selected tokens only
      this.prisma.tokenAnalysis.updateMany({
        where: { tokenId: { in: tokenIds }, isPrimary: true },
        data: { isPrimary: false },
      }),
      // Insert new admin-annotated analyses (skip if already linked to this lemma)
      this.prisma.tokenAnalysis.createMany({
        data: tokenIds.map((tokenId) => ({
          tokenId,
          lemmaId,
          isPrimary: true,
          source: AnalysisSource.ADMIN,
          probability: 1.0,
        })),
        skipDuplicates: true,
      }),
    ]);

    // Promote any existing analyses that were skipped by createMany
    await this.prisma.tokenAnalysis.updateMany({
      where: { tokenId: { in: tokenIds }, lemmaId, isPrimary: false },
      data: { isPrimary: true, source: AnalysisSource.ADMIN },
    });

    // Collect versionIds for cache invalidation
    const tokens = await this.prisma.textToken.findMany({
      where: { id: { in: tokenIds } },
      select: { id: true, versionId: true },
    });
    const versionIds = [...new Set(tokens.map((t) => t.versionId))];

    await Promise.all([
      ...tokenIds.map((id) => this.cache.deleteByTokenId(id)),
      ...versionIds.map((vId) => this.cache.deleteByVersionNormalized(vId, normalized)),
    ]);

    return { success: true, updatedTokens: tokenIds.length, lemmaBaseForm: lemma.baseForm };
  }

  async createMorphForm(normalized: string, lemmaId: string, translation?: string) {
    const lemma = await this.prisma.lemma.findUnique({
      where: { id: lemmaId },
      select: { id: true, baseForm: true },
    });
    if (!lemma) throw new NotFoundException("Lemma not found");

    const tokens = await this.prisma.textToken.findMany({
      where: { normalized },
      select: { id: true, versionId: true },
    });
    const tokenIds = tokens.map((t) => t.id);

    await this.prisma.$transaction([
      this.prisma.morphForm.upsert({
        where: { normalized_lemmaId: { normalized, lemmaId } },
        create: { form: normalized, normalized, lemmaId, translation: translation ?? null },
        update: { translation: translation ?? null },
      }),
      // Demote any existing primary analyses for these tokens
      this.prisma.tokenAnalysis.updateMany({
        where: { tokenId: { in: tokenIds }, isPrimary: true },
        data: { isPrimary: false },
      }),
      // Insert the new admin-annotated analyses; skip tokens that already have this lemma linked
      this.prisma.tokenAnalysis.createMany({
        data: tokenIds.map((tokenId) => ({
          tokenId,
          lemmaId,
          isPrimary: true,
          source: AnalysisSource.ADMIN,
          probability: 1.0,
        })),
        skipDuplicates: true,
      }),
    ]);

    // Existing analyses that already had this lemmaId were skipped by createMany —
    // promote them to primary in one batch update.
    await this.prisma.tokenAnalysis.updateMany({
      where: { tokenId: { in: tokenIds }, lemmaId, isPrimary: false },
      data: { isPrimary: true, source: AnalysisSource.ADMIN },
    });

    const versionIds = [...new Set(tokens.map((t) => t.versionId))];
    await Promise.all([
      ...tokenIds.map((id) => this.cache.deleteByTokenId(id)),
      ...versionIds.map((vId) => this.cache.deleteByVersionNormalized(vId, normalized)),
    ]);

    return { success: true, lemmaBaseForm: lemma.baseForm, updatedTokens: tokens.length };
  }

  async annotateToken(tokenId: string, lemmaId: string, scope: AnnotateScope) {
    const token = await this.prisma.textToken.findUnique({
      where: { id: tokenId },
      select: { id: true, versionId: true, normalized: true, original: true },
    });
    if (!token) throw new NotFoundException("Token not found");

    const lemma = await this.prisma.lemma.findUnique({
      where: { id: lemmaId },
      select: { id: true, baseForm: true },
    });
    if (!lemma) throw new NotFoundException("Lemma not found");

    if (scope === "global") {
      await this.prisma.morphForm.upsert({
        where: { normalized_lemmaId: { normalized: token.normalized, lemmaId } },
        create: {
          form: token.original,
          normalized: token.normalized,
          lemmaId,
        },
        update: {},
      });
    }

    await this.applyLocalAnnotation(token.id, lemmaId);

    await this.cache.deleteByTokenId(tokenId);
    await this.cache.deleteByVersionNormalized(token.versionId, token.normalized);

    return { success: true, lemmaBaseForm: lemma.baseForm };
  }

  async getAnnotatedFormsByPage(textId: string, pageNumber: number) {
    // Use the latest completed processing version for accurate token set
    const version = await this.prisma.textProcessingVersion.findFirst({
      where: { textId, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!version) return [];

    const page = await this.prisma.textPage.findFirst({
      where: { textId, pageNumber },
      select: { id: true },
    });
    if (!page) return [];

    // Collect distinct normalized forms that appear on this page in the latest version
    const tokens = await this.prisma.textToken.findMany({
      where: { versionId: version.id, pageId: page.id },
      select: { normalized: true },
      distinct: ["normalized"],
    });
    if (!tokens.length) return [];

    const normalizedForms = tokens.map((t) => t.normalized);

    // MorphForm existence = annotation — no need to check TokenAnalysis source
    const morphForms = await this.prisma.morphForm.findMany({
      where: { normalized: { in: normalizedForms } },
      select: {
        id: true,
        form: true,
        normalized: true,
        translation: true,
        lemma: { select: { id: true, baseForm: true } },
      },
    });

    // Deduplicate by normalized form (multiple lemmas per form are possible)
    const seen = new Set<string>();
    const result: {
      morphFormId: string;
      normalized: string;
      form: string;
      lemmaId: string;
      lemmaBaseForm: string;
      translation: string | null;
    }[] = [];

    for (const mf of morphForms) {
      if (seen.has(mf.normalized)) continue;
      seen.add(mf.normalized);
      result.push({
        morphFormId: mf.id,
        normalized: mf.normalized,
        form: mf.form,
        lemmaId: mf.lemma.id,
        lemmaBaseForm: mf.lemma.baseForm,
        translation: mf.translation,
      });
    }

    return result;
  }

  async listMorphForms(q?: string, page = 1, limit = 50) {
    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;

    const where = q
      ? {
          OR: [
            { normalized: { contains: q.toLowerCase(), mode: "insensitive" as const } },
            { form: { contains: q, mode: "insensitive" as const } },
            { lemma: { baseForm: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.morphForm.findMany({
        where,
        take,
        skip,
        orderBy: { normalized: "asc" },
        select: {
          id: true,
          form: true,
          normalized: true,
          translation: true,
          lemma: { select: { id: true, baseForm: true, normalized: true, partOfSpeech: true } },
        },
      }),
      this.prisma.morphForm.count({ where }),
    ]);

    return { items, total, page, limit: take };
  }

  async getMorphForm(id: string) {
    const mf = await this.prisma.morphForm.findUnique({
      where: { id },
      select: {
        id: true,
        form: true,
        normalized: true,
        translation: true,
        lemma: { select: { id: true, baseForm: true, normalized: true, partOfSpeech: true } },
      },
    });
    if (!mf) throw new NotFoundException("MorphForm not found");
    const tokenCount = await this.prisma.textToken.count({ where: { normalized: mf.normalized } });
    return { ...mf, tokenCount };
  }

  async updateMorphForm(id: string, translation?: string) {
    const mf = await this.prisma.morphForm.findUnique({ where: { id }, select: { id: true } });
    if (!mf) throw new NotFoundException("MorphForm not found");
    return this.prisma.morphForm.update({
      where: { id },
      data: { translation: translation ?? null },
      select: {
        id: true,
        form: true,
        normalized: true,
        translation: true,
        lemma: { select: { id: true, baseForm: true } },
      },
    });
  }

  async deleteMorphForm(id: string) {
    const mf = await this.prisma.morphForm.findUnique({
      where: { id },
      select: { id: true, normalized: true, lemmaId: true },
    });
    if (!mf) throw new NotFoundException("MorphForm not found");

    // Find tokens with this normalized form that have ADMIN analyses for this lemma
    const tokens = await this.prisma.textToken.findMany({
      where: { normalized: mf.normalized },
      select: { id: true, versionId: true },
    });
    const tokenIds = tokens.map((t) => t.id);

    // Demote ADMIN-source primary TokenAnalysis records back to non-primary
    if (tokenIds.length) {
      await this.prisma.tokenAnalysis.deleteMany({
        where: { tokenId: { in: tokenIds }, lemmaId: mf.lemmaId, source: AnalysisSource.ADMIN },
      });
    }

    await this.prisma.morphForm.delete({ where: { id } });

    // Invalidate cache
    const versionIds = [...new Set(tokens.map((t) => t.versionId))];
    await Promise.all([
      ...tokenIds.map((tid) => this.cache.deleteByTokenId(tid)),
      ...versionIds.map((vId) => this.cache.deleteByVersionNormalized(vId, mf.normalized)),
    ]);

    return { success: true };
  }

  private async applyLocalAnnotation(tokenId: string, lemmaId: string) {
    await this.prisma.tokenAnalysis.updateMany({
      where: { tokenId, isPrimary: true },
      data: { isPrimary: false },
    });

    const existing = await this.prisma.tokenAnalysis.findFirst({
      where: { tokenId, lemmaId },
    });

    if (existing) {
      await this.prisma.tokenAnalysis.update({
        where: { id: existing.id },
        data: { isPrimary: true, source: AnalysisSource.ADMIN },
      });
    } else {
      await this.prisma.tokenAnalysis.create({
        data: {
          tokenId,
          lemmaId,
          isPrimary: true,
          source: AnalysisSource.ADMIN,
          probability: 1.0,
        },
      });
    }
  }
}
