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
          {
            headwords: {
              some: {
                OR: [
                  { text: { contains: term, mode: "insensitive" } },
                  { normalized: { contains: term.toLowerCase(), mode: "insensitive" } },
                ],
              },
            },
          },
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
      select: {
        id: true,
        pageId: true,
        position: true,
        original: true,
        analyses: { where: { source: AnalysisSource.ADMIN, isPrimary: true }, select: { id: true } },
      },
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
      return {
        tokenId: occ.id,
        word: occ.original,
        before: before.join(" "),
        after: after.join(" "),
        isAnnotated: occ.analyses.length > 0,
      };
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
      // Upsert MorphForm so this (normalized, lemmaId) pair is visible on the annotations page
      this.prisma.morphForm.upsert({
        where: { normalized_lemmaId: { normalized, lemmaId } },
        create: { form: normalized, normalized, lemmaId, translation: translation ?? null },
        update: translation !== undefined ? { translation } : {},
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

    // Find ALL ADMIN-annotated tokens across the entire version.
    // We need cross-page data so that forms annotated on page 1 still show highlights on page 2.
    const adminAnnotatedTokens = await this.prisma.textToken.findMany({
      where: {
        versionId: version.id,
        analyses: { some: { source: AnalysisSource.ADMIN, isPrimary: true } },
      },
      select: {
        id: true,
        normalized: true,
        original: true,
        pageId: true,
        analyses: {
          where: { source: AnalysisSource.ADMIN, isPrimary: true },
          take: 1,
          select: {
            id: true,
            lemmaId: true,
            lemma: { select: { id: true, baseForm: true } },
          },
        },
      },
    });
    if (!adminAnnotatedTokens.length) return [];

    // Deduplicate by normalized form, preferring MorphForm translation if available
    const normalizedForms = [...new Set(adminAnnotatedTokens.map((t) => t.normalized))];

    const morphFormsByNormalized = await this.prisma.morphForm.findMany({
      where: { normalized: { in: normalizedForms } },
      select: { id: true, normalized: true, lemmaId: true, translation: true },
    });
    const morphFormMap = new Map(
      morphFormsByNormalized.map((mf) => [`${mf.normalized}:${mf.lemmaId}`, mf]),
    );

    // Build form+lemma groups from current-page tokens (determines which forms appear in the panel)
    const tokensByFormLemma = new Map<string, { tokenId: string; lemmaId: string; normalized: string; original: string; analysisId: string; lemmaBaseForm: string }[]>();
    for (const token of adminAnnotatedTokens) {
      const analysis = token.analyses[0];
      if (!analysis?.lemma || !analysis.lemmaId) continue;
      const key = `${token.normalized}:${analysis.lemmaId}`;
      const list = tokensByFormLemma.get(key) ?? [];
      list.push({ tokenId: token.id, lemmaId: analysis.lemmaId, normalized: token.normalized, original: token.original, analysisId: analysis.id, lemmaBaseForm: analysis.lemma.baseForm });
      tokensByFormLemma.set(key, list);
    }

    // Build annotated set per normalized+lemmaId directly from adminAnnotatedTokens (already all pages)
    const annotatedTokenIdByNormalizedLemma = new Map<string, Set<string>>();
    for (const token of adminAnnotatedTokens) {
      const lemmaId = token.analyses[0]?.lemmaId;
      if (!lemmaId) continue;
      const key = `${token.normalized}:${lemmaId}`;
      const set = annotatedTokenIdByNormalizedLemma.get(key) ?? new Set<string>();
      set.add(token.id);
      annotatedTokenIdByNormalizedLemma.set(key, set);
    }

    // pageOccurrences: tokens on THIS page only, in position order — used by editor highlights.
    const pageFormTokens = await this.prisma.textToken.findMany({
      where: { versionId: version.id, pageId: page.id, normalized: { in: normalizedForms } },
      select: { id: true, normalized: true, position: true },
      orderBy: { position: "asc" },
    });

    // allOccurrences: tokens across ALL pages — used by edit dialog to initialize selection state.
    const allFormTokens = await this.prisma.textToken.findMany({
      where: { versionId: version.id, normalized: { in: normalizedForms } },
      select: { id: true, normalized: true, original: true, pageId: true, position: true },
      orderBy: [{ pageId: "asc" }, { position: "asc" }],
    });

    // Build per-page context windows for before/after snippets in allOccurrences
    const allPageRanges = new Map<string, { min: number; max: number }>();
    for (const t of allFormTokens) {
      if (!t.pageId) continue;
      const ex = allPageRanges.get(t.pageId);
      if (ex) {
        ex.min = Math.min(ex.min, t.position - SNIPPET_WINDOW);
        ex.max = Math.max(ex.max, t.position + SNIPPET_WINDOW);
      } else {
        allPageRanges.set(t.pageId, { min: t.position - SNIPPET_WINDOW, max: t.position + SNIPPET_WINDOW });
      }
    }
    const allPageContexts = new Map<string, Map<number, string>>();
    await Promise.all(
      [...allPageRanges.entries()].map(async ([pageId, { min, max }]) => {
        const tokens = await this.prisma.textToken.findMany({
          where: { pageId, position: { gte: min, lte: max } },
          select: { position: true, original: true },
          orderBy: { position: "asc" },
        });
        allPageContexts.set(pageId, new Map(tokens.map((t) => [t.position, t.original])));
      }),
    );

    // For each form+lemma group, build occurrences showing which tokens belong to THIS lemma
    const result: {
      morphFormId: string;
      hasMorphForm: boolean;
      normalized: string;
      form: string;
      lemmaId: string;
      lemmaBaseForm: string;
      translation: string | null;
      pageOccurrences: { tokenId: string; isAnnotated: boolean }[];
      allOccurrences: { tokenId: string; word: string; before: string; after: string; isAnnotated: boolean }[];
      inPanel: boolean;
    }[] = [];

    // Deduplicate form+lemma groups by normalized to avoid duplicate pageOccurrences entries
    // when the same form is annotated to different lemmas (each lemma gets its own panel entry,
    // but pageOccurrences for highlights should cover all lemmas merged).
    const seenNormalizedForHighlights = new Set<string>();

    for (const [key, tokens] of tokensByFormLemma) {
      const { normalized, original, lemmaId, lemmaBaseForm, analysisId } = tokens[0];
      const annotatedSet = annotatedTokenIdByNormalizedLemma.get(key)!;
      const mf = morphFormMap.get(key);

      const pageOccurrences = pageFormTokens
        .filter((t) => t.normalized === normalized)
        .map((t) => ({ tokenId: t.id, isAnnotated: annotatedSet.has(t.id) }));

      const hasAnnotatedTokenOnPage = pageOccurrences.some((o) => o.isAnnotated);

      const allOccurrences = allFormTokens
        .filter((t) => t.normalized === normalized)
        .map((t) => {
          const ctx = t.pageId ? allPageContexts.get(t.pageId) : null;
          const before: string[] = [];
          const after: string[] = [];
          if (ctx) {
            for (let p = t.position - SNIPPET_WINDOW; p < t.position; p++) {
              const w = ctx.get(p); if (w) before.push(w);
            }
            for (let p = t.position + 1; p <= t.position + SNIPPET_WINDOW; p++) {
              const w = ctx.get(p); if (w) after.push(w);
            }
          }
          return { tokenId: t.id, word: t.original, before: before.join(" "), after: after.join(" "), isAnnotated: annotatedSet.has(t.id) };
        });

      if (hasAnnotatedTokenOnPage) {
        result.push({
          morphFormId: mf?.id ?? analysisId,
          hasMorphForm: Boolean(mf),
          normalized,
          form: original,
          lemmaId,
          lemmaBaseForm,
          translation: mf?.translation ?? null,
          pageOccurrences,
          allOccurrences,
          inPanel: true,
        });
        seenNormalizedForHighlights.add(normalized);
      } else if (!seenNormalizedForHighlights.has(normalized) && pageOccurrences.length > 0) {
        // Not annotated on this page, but appears here and is annotated elsewhere — highlight only.
        seenNormalizedForHighlights.add(normalized);
        result.push({
          morphFormId: mf?.id ?? analysisId,
          hasMorphForm: Boolean(mf),
          normalized,
          form: original,
          lemmaId,
          lemmaBaseForm,
          translation: mf?.translation ?? null,
          pageOccurrences,
          allOccurrences,
          inPanel: false,
        });
      }
    }

    return result;
  }

  async getMorphFormOccurrences(morphFormId: string) {
    const mf = await this.prisma.morphForm.findUnique({
      where: { id: morphFormId },
      select: { normalized: true, lemmaId: true },
    });
    if (!mf) throw new NotFoundException("MorphForm not found");

    const annotatedTokens = await this.prisma.textToken.findMany({
      where: {
        normalized: mf.normalized,
        analyses: { some: { source: AnalysisSource.ADMIN, isPrimary: true, lemmaId: mf.lemmaId } },
      },
      select: { id: true, original: true, pageId: true, position: true },
      orderBy: [{ pageId: "asc" }, { position: "asc" }],
    });
    if (!annotatedTokens.length) return [];

    const pageRanges = new Map<string, { min: number; max: number }>();
    for (const t of annotatedTokens) {
      if (!t.pageId) continue;
      const ex = pageRanges.get(t.pageId);
      if (ex) {
        ex.min = Math.min(ex.min, t.position - SNIPPET_WINDOW);
        ex.max = Math.max(ex.max, t.position + SNIPPET_WINDOW);
      } else {
        pageRanges.set(t.pageId, { min: t.position - SNIPPET_WINDOW, max: t.position + SNIPPET_WINDOW });
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

    return annotatedTokens.map((t) => {
      const ctx = t.pageId ? pageContexts.get(t.pageId) : null;
      const before: string[] = [];
      const after: string[] = [];
      if (ctx) {
        for (let p = t.position - SNIPPET_WINDOW; p < t.position; p++) {
          const w = ctx.get(p); if (w) before.push(w);
        }
        for (let p = t.position + 1; p <= t.position + SNIPPET_WINDOW; p++) {
          const w = ctx.get(p); if (w) after.push(w);
        }
      }
      return { tokenId: t.id, word: t.original, before: before.join(" "), after: after.join(" "), isAnnotated: true as const };
    });
  }

  async syncMorphForms() {
    // Find all (normalized, lemmaId) pairs from ADMIN TokenAnalysis
    const adminAnalyses = await this.prisma.tokenAnalysis.findMany({
      where: { source: AnalysisSource.ADMIN, isPrimary: true },
      select: {
        lemmaId: true,
        token: { select: { normalized: true, original: true } },
      },
    });

    // Deduplicate by (normalized, lemmaId)
    const pairsMap = new Map<string, { normalized: string; original: string; lemmaId: string }>();
    for (const a of adminAnalyses) {
      if (!a.lemmaId) continue;
      const key = `${a.token.normalized}:${a.lemmaId}`;
      if (!pairsMap.has(key)) {
        pairsMap.set(key, { normalized: a.token.normalized, original: a.token.original, lemmaId: a.lemmaId });
      }
    }

    // Find which pairs already have a MorphForm
    const existingForms = await this.prisma.morphForm.findMany({
      where: {
        OR: [...pairsMap.values()].map(({ normalized, lemmaId }) => ({ normalized, lemmaId })),
      },
      select: { normalized: true, lemmaId: true },
    });
    const existingKeys = new Set(existingForms.map((f) => `${f.normalized}:${f.lemmaId}`));

    // Create missing MorphForms
    const missing = [...pairsMap.values()].filter(({ normalized, lemmaId }) => !existingKeys.has(`${normalized}:${lemmaId}`));

    if (missing.length > 0) {
      await this.prisma.morphForm.createMany({
        data: missing.map(({ normalized, original, lemmaId }) => ({
          form: original,
          normalized,
          lemmaId,
          translation: null,
        })),
        skipDuplicates: true,
      });
    }

    return { synced: missing.length, total: pairsMap.size };
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
    try {
      return await this.prisma.morphForm.update({
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
    } catch (e: unknown) {
      if ((e as { code?: string }).code === "P2025") throw new NotFoundException("MorphForm not found");
      throw e;
    }
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

  async unannotateTokens(tokenIds: string[]) {
    if (!tokenIds.length) return { success: true, updatedTokens: 0 };

    const tokens = await this.prisma.textToken.findMany({
      where: { id: { in: tokenIds } },
      select: { id: true, versionId: true, normalized: true },
    });

    // Find which lemmas were ADMIN-annotated on these tokens (to check orphaned MorphForms after)
    const adminAnalyses = await this.prisma.tokenAnalysis.findMany({
      where: { tokenId: { in: tokenIds }, source: AnalysisSource.ADMIN },
      select: { lemmaId: true, tokenId: true },
    });

    await this.prisma.tokenAnalysis.deleteMany({
      where: { tokenId: { in: tokenIds }, source: AnalysisSource.ADMIN },
    });

    // For each normalized form, check if any ADMIN-annotated tokens remain.
    // If none remain, delete the MorphForm so the word stops being highlighted.
    const normalizedForms = [...new Set(tokens.map((t) => t.normalized))];
    const lemmaIdsByNormalized = new Map<string, Set<string>>();
    for (const token of tokens) {
      for (const analysis of adminAnalyses.filter((a) => a.tokenId === token.id)) {
        if (!analysis.lemmaId) continue;
        if (!lemmaIdsByNormalized.has(token.normalized)) {
          lemmaIdsByNormalized.set(token.normalized, new Set());
        }
        lemmaIdsByNormalized.get(token.normalized)!.add(analysis.lemmaId);
      }
    }

    // Single query: find all remaining ADMIN-annotated (normalized, lemmaId) pairs
    const remainingAnnotations = await this.prisma.tokenAnalysis.findMany({
      where: {
        source: AnalysisSource.ADMIN,
        isPrimary: true,
        lemmaId: { in: [...new Set(adminAnalyses.map((a) => a.lemmaId).filter(Boolean))] as string[] },
        token: { normalized: { in: normalizedForms } },
      },
      select: { lemmaId: true, token: { select: { normalized: true } } },
    });
    const remainingKeys = new Set(
      remainingAnnotations.map((r) => `${r.token.normalized}:${r.lemmaId}`),
    );

    // Delete MorphForms for pairs that no longer have any annotated tokens
    const orphanedPairs: { normalized: string; lemmaId: string }[] = [];
    for (const [normalized, lemmaIds] of lemmaIdsByNormalized.entries()) {
      for (const lemmaId of lemmaIds) {
        if (!remainingKeys.has(`${normalized}:${lemmaId}`)) {
          orphanedPairs.push({ normalized, lemmaId });
        }
      }
    }
    if (orphanedPairs.length) {
      await this.prisma.morphForm.deleteMany({
        where: { OR: orphanedPairs.map(({ normalized, lemmaId }) => ({ normalized, lemmaId })) },
      });
    }

    const versionIds = [...new Set(tokens.map((t) => t.versionId))];

    await Promise.all([
      ...tokenIds.map((id) => this.cache.deleteByTokenId(id)),
      ...versionIds.flatMap((vId) =>
        normalizedForms.map((norm) => this.cache.deleteByVersionNormalized(vId, norm)),
      ),
    ]);

    return { success: true, updatedTokens: tokenIds.length };
  }

  private async applyLocalAnnotation(tokenId: string, lemmaId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.tokenAnalysis.updateMany({
        where: { tokenId, isPrimary: true },
        data: { isPrimary: false },
      });

      const existing = await tx.tokenAnalysis.findFirst({
        where: { tokenId, lemmaId },
        select: { id: true },
      });

      if (existing) {
        await tx.tokenAnalysis.update({
          where: { id: existing.id },
          data: { isPrimary: true, source: AnalysisSource.ADMIN },
        });
      } else {
        await tx.tokenAnalysis.create({
          data: {
            tokenId,
            lemmaId,
            isPrimary: true,
            source: AnalysisSource.ADMIN,
            probability: 1.0,
          },
        });
      }
    });
  }
}
