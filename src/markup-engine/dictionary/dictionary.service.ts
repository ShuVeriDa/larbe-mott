import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DictionarySource, Language, Level, Prisma, WordStatus } from "@prisma/client";
import { BulkDeleteDto } from "src/admin/dictionary/dto/bulk-delete.dto";
import { CreateEntryDto } from "src/admin/dictionary/dto/create-entry.dto";
import { CreateExampleDto } from "src/admin/dictionary/dto/create-example.dto";
import { CreateHeadwordDto } from "src/admin/dictionary/dto/create-headword.dto";
import { CreateMorphFormDto } from "src/admin/dictionary/dto/create-morph-form.dto";
import { CreateSenseDto } from "src/admin/dictionary/dto/create-sense.dto";
import { DictSortOption, DictTabOption } from "src/admin/dictionary/dto/list-query.dto";
import { PatchEntryDto } from "src/admin/dictionary/dto/update-entry.dto";
import { UpdateExampleDto } from "src/admin/dictionary/dto/update-example.dto";
import { UpdateMorphFormDto } from "src/admin/dictionary/dto/update-morph-form.dto";
import { UpdateSenseDto } from "src/admin/dictionary/dto/update-sense.dto";
import { PrismaService } from "src/prisma.service";
import { normalizeToken } from "../tokenizer/tokenizer.utils";

/** Унифицированный админ-словарь: одна иерархия DictionaryEntry + Headword (source=ADMIN). */
@Injectable()
export class DictionaryService {
  constructor(private prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────
  // CREATE ENTRY
  // ─────────────────────────────────────────────────────

  async createEntry(dto: CreateEntryDto, userId: string) {
    const normalized = normalizeToken(dto.word);

    return this.prisma.$transaction(async (tx) => {
      let lemma = await tx.lemma.findUnique({
        where: { normalized_language: { normalized, language: dto.language } },
      });

      if (!lemma) {
        lemma = await tx.lemma.create({
          data: {
            baseForm: dto.word,
            normalized,
            language: dto.language,
            partOfSpeech: dto.partOfSpeech ?? null,
            level: dto.level ?? null,
          },
        });
      }

      const entry = await tx.dictionaryEntry.create({
        data: {
          rawWord: dto.word,
          rawTranslate: dto.translation,
          source: DictionarySource.ADMIN,
          createdById: userId,
          notes: dto.notes ?? null,
        },
      });

      await tx.headword.create({
        data: { entryId: entry.id, text: dto.word, normalized, lemmaId: lemma.id, order: 0, isPrimary: true },
      });

      if (dto.forms?.length) {
        await tx.morphForm.createMany({
          data: dto.forms.map((form) => ({
            form,
            normalized: normalizeToken(form),
            lemmaId: lemma.id,
          })),
          skipDuplicates: true,
        });
      }

      return lemma;
    });
  }

  // ─────────────────────────────────────────────────────
  // STATS
  // ─────────────────────────────────────────────────────

  async getStats() {
    const adminEntryWhere: Prisma.DictionaryEntryWhereInput = {
      source: DictionarySource.ADMIN,
    };

    const lemmaWithAdminHeadword: Prisma.LemmaWhereInput = {
      headwords: { some: { entry: { source: DictionarySource.ADMIN } } },
    };

    const [
      totalEntries,
      totalLemmas,
      totalSenses,
      totalMorphForms,
      entriesWithoutSenses,
      unknownWordsCount,
    ] = await Promise.all([
      this.prisma.dictionaryEntry.count({ where: adminEntryWhere }),
      this.prisma.lemma.count({ where: lemmaWithAdminHeadword }),
      this.prisma.sense.count({
        where: { entry: { source: DictionarySource.ADMIN } },
      }),
      this.prisma.morphForm.count({
        where: { lemma: lemmaWithAdminHeadword },
      }),
      this.prisma.dictionaryEntry.count({
        where: {
          source: DictionarySource.ADMIN,
          senses: { none: {} },
        },
      }),
      this.prisma.unknownWord.count(),
    ]);

    return {
      totalEntries,
      totalLemmas,
      totalSenses,
      totalMorphForms,
      entriesWithoutSenses,
      unknownWordsCount,
    };
  }

  // ─────────────────────────────────────────────────────
  // LIST
  // ─────────────────────────────────────────────────────

  async getListForAdmin(params: {
    q?: string;
    language?: Language;
    pos?: string;
    level?: Level;
    sort?: DictSortOption;
    tab?: DictTabOption;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;
    const sort = params.sort ?? "alpha";
    const tab = params.tab ?? "all";

    const baseEntryWhere: Prisma.DictionaryEntryWhereInput = {
      source: DictionarySource.ADMIN,
    };

    // Tab filters applied via headword → entry
    let entryTabCondition: Prisma.DictionaryEntryWhereInput = { ...baseEntryWhere };
    if (tab === "no_senses") {
      entryTabCondition = { ...baseEntryWhere, senses: { none: {} } };
    } else if (tab === "no_examples") {
      entryTabCondition = {
        ...baseEntryWhere,
        senses: { none: { examples: { some: {} } } },
      };
    }

    const where: Prisma.LemmaWhereInput = {
      headwords: { some: { entry: entryTabCondition } },
    };

    if (tab === "no_forms") {
      where.morphForms = { none: {} };
    }
    if (params.language) where.language = params.language;
    if (params.pos) where.partOfSpeech = { equals: params.pos, mode: "insensitive" };
    if (params.level) where.level = params.level;

    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { normalized: { contains: q, mode: "insensitive" } },
        { baseForm: { contains: q, mode: "insensitive" } },
      ];
    }

    // Sort order
    let orderBy: Prisma.LemmaOrderByWithRelationInput[] = [{ normalized: "asc" }];
    if (sort === "frequency_desc") {
      orderBy = [{ frequency: { sort: "desc", nulls: "last" } }, { normalized: "asc" }];
    } else if (sort === "newest") {
      orderBy = [{ createdAt: "desc" }];
    }
    // "no_senses" sort — same as alpha but filtered entries come first; we just filter by tab

    const [lemmas, total] = await Promise.all([
      this.prisma.lemma.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          headwords: {
            where: { entry: { source: DictionarySource.ADMIN } },
            include: {
              entry: {
                select: {
                  id: true,
                  rawTranslate: true,
                  cachedAt: true,
                  _count: { select: { senses: true } },
                  senses: {
                    orderBy: { order: "asc" },
                    take: 3,
                    select: { id: true, order: true, definition: true },
                  },
                },
              },
            },
            take: 1,
          },
          _count: { select: { morphForms: true } },
        },
      }),
      this.prisma.lemma.count({ where }),
    ]);

    const items = lemmas.map((l) => {
      const entry = l.headwords[0]?.entry;
      return {
        id: l.id,
        baseForm: l.baseForm,
        normalized: l.normalized,
        language: l.language,
        partOfSpeech: l.partOfSpeech,
        level: l.level,
        frequency: l.frequency,
        createdAt: l.createdAt,
        translation: entry?.rawTranslate ?? null,
        entryId: entry?.id ?? null,
        sensesCount: entry?._count?.senses ?? 0,
        sensesPreview: entry?.senses ?? [],
        formsCount: l._count.morphForms,
      };
    });

    // Collect tab counts for the UI tabs
    const [countNoSenses, countNoExamples, countNoForms] = await Promise.all([
      this.prisma.dictionaryEntry.count({
        where: { source: DictionarySource.ADMIN, senses: { none: {} } },
      }),
      this.prisma.dictionaryEntry.count({
        where: {
          source: DictionarySource.ADMIN,
          senses: { none: { examples: { some: {} } } },
        },
      }),
      this.prisma.lemma.count({
        where: {
          headwords: { some: { entry: { source: DictionarySource.ADMIN } } },
          morphForms: { none: {} },
        },
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      tabCounts: {
        all: total,
        no_senses: countNoSenses,
        no_examples: countNoExamples,
        no_forms: countNoForms,
      },
    };
  }

  // ─────────────────────────────────────────────────────
  // CARD (detail)
  // ─────────────────────────────────────────────────────

  async getCardForAdmin(lemmaId: string) {
    const lemma = await this.prisma.lemma.findFirst({
      where: {
        id: lemmaId,
        headwords: { some: { entry: { source: DictionarySource.ADMIN } } },
      },
      include: {
        headwords: {
          where: { entry: { source: DictionarySource.ADMIN } },
          orderBy: { order: "asc" },
          include: {
            entry: {
              select: {
                id: true,
                rawWord: true,
                rawTranslate: true,
                notes: true,
                senses: {
                  orderBy: { order: "asc" },
                  select: {
                    id: true,
                    order: true,
                    definition: true,
                    notes: true,
                    examples: {
                      select: { id: true, text: true, translation: true },
                    },
                  },
                },
              },
            },
          },
        },
        morphForms: {
          orderBy: [{ gramCase: "asc" }, { gramNumber: "asc" }],
          select: { id: true, form: true, normalized: true, grammarTag: true, gramCase: true, gramNumber: true },
        },
      },
    });

    if (!lemma) throw new NotFoundException("Dictionary entry not found");

    const primaryHw = lemma.headwords.find((h) => h.isPrimary) ?? lemma.headwords[0];
    const entry = primaryHw?.entry;

    return {
      id: lemma.id,
      baseForm: lemma.baseForm,
      normalized: lemma.normalized,
      language: lemma.language,
      partOfSpeech: lemma.partOfSpeech,
      level: lemma.level,
      frequency: lemma.frequency,
      createdAt: lemma.createdAt,
      updatedAt: lemma.updatedAt,
      translation: entry?.rawTranslate ?? null,
      notes: entry?.notes ?? null,
      entryId: entry?.id ?? null,
      headwords: lemma.headwords.map((h) => ({
        id: h.id,
        text: h.text,
        normalized: h.normalized,
        isPrimary: h.isPrimary,
        order: h.order,
      })),
      senses: entry?.senses ?? [],
      forms: lemma.morphForms,
    };
  }

  // ─────────────────────────────────────────────────────
  // UPDATE ENTRY
  // ─────────────────────────────────────────────────────

  async updateEntry(lemmaId: string, dto: PatchEntryDto) {
    const lemma = await this.prisma.lemma.findFirst({
      where: {
        id: lemmaId,
        headwords: { some: { entry: { source: DictionarySource.ADMIN } } },
      },
      include: {
        headwords: {
          where: { entry: { source: DictionarySource.ADMIN } },
          include: { entry: true },
        },
      },
    });
    if (!lemma) throw new NotFoundException("Dictionary entry not found");

    await this.prisma.$transaction(async (tx) => {
      if (
        dto.baseForm !== undefined ||
        dto.partOfSpeech !== undefined ||
        dto.level !== undefined
      ) {
        await tx.lemma.update({
          where: { id: lemmaId },
          data: {
            ...(dto.baseForm !== undefined && {
              baseForm: dto.baseForm,
              normalized: normalizeToken(dto.baseForm),
            }),
            ...(dto.partOfSpeech !== undefined && { partOfSpeech: dto.partOfSpeech }),
            ...(dto.level !== undefined && { level: dto.level }),
          },
        });
      }

      const entry = lemma.headwords[0]?.entry;
      if (entry && (dto.translation !== undefined || dto.notes !== undefined)) {
        await tx.dictionaryEntry.update({
          where: { id: entry.id },
          data: {
            ...(dto.translation !== undefined && { rawTranslate: dto.translation }),
            ...(dto.notes !== undefined && { notes: dto.notes }),
          },
        });
      }

      if (dto.forms !== undefined) {
        await tx.morphForm.deleteMany({ where: { lemmaId } });
        if (dto.forms.length > 0) {
          await tx.morphForm.createMany({
            data: dto.forms.map((form) => ({
              form,
              normalized: normalizeToken(form),
              lemmaId,
            })),
            skipDuplicates: true,
          });
        }
      }
    });

    return this.getCardForAdmin(lemmaId);
  }

  // ─────────────────────────────────────────────────────
  // DELETE ENTRY
  // ─────────────────────────────────────────────────────

  async deleteEntry(lemmaId: string) {
    const lemma = await this.prisma.lemma.findFirst({
      where: {
        id: lemmaId,
        headwords: { some: { entry: { source: DictionarySource.ADMIN } } },
      },
      include: {
        headwords: {
          where: { entry: { source: DictionarySource.ADMIN } },
          select: { entryId: true },
        },
      },
    });
    if (!lemma) throw new NotFoundException("Dictionary entry not found");

    const entryIds = lemma.headwords.map((h) => h.entryId);

    await this.prisma.$transaction([
      // DictionaryEntry cascade deletes Headword, Sense → Example, MorphForm (entryId)
      this.prisma.dictionaryEntry.deleteMany({
        where: { id: { in: entryIds } },
      }),
      // Lemma cascade deletes MorphForms (lemmaId), etc.
      this.prisma.lemma.delete({ where: { id: lemmaId } }),
    ]);
  }

  // ─────────────────────────────────────────────────────
  // BULK DELETE
  // ─────────────────────────────────────────────────────

  async bulkDelete(dto: BulkDeleteDto) {
    const lemmas = await this.prisma.lemma.findMany({
      where: {
        id: { in: dto.ids },
        headwords: { some: { entry: { source: DictionarySource.ADMIN } } },
      },
      include: {
        headwords: {
          where: { entry: { source: DictionarySource.ADMIN } },
          select: { entryId: true },
        },
      },
    });

    const entryIds = lemmas.flatMap((l) => l.headwords.map((h) => h.entryId));
    const lemmaIds = lemmas.map((l) => l.id);

    await this.prisma.$transaction([
      this.prisma.dictionaryEntry.deleteMany({ where: { id: { in: entryIds } } }),
      this.prisma.lemma.deleteMany({ where: { id: { in: lemmaIds } } }),
    ]);

    return { deleted: lemmaIds.length };
  }

  // ─────────────────────────────────────────────────────
  // SENSES
  // ─────────────────────────────────────────────────────

  private async getEntryIdForLemma(lemmaId: string): Promise<string> {
    const headword = await this.prisma.headword.findFirst({
      where: {
        lemmaId,
        entry: { source: DictionarySource.ADMIN },
      },
      select: { entryId: true },
    });
    if (!headword) throw new NotFoundException("Dictionary entry not found");
    return headword.entryId;
  }

  async addSense(lemmaId: string, dto: CreateSenseDto) {
    const entryId = await this.getEntryIdForLemma(lemmaId);

    const maxOrder = await this.prisma.sense.aggregate({
      where: { entryId },
      _max: { order: true },
    });
    const order = dto.order ?? (maxOrder._max.order ?? -1) + 1;

    return this.prisma.sense.create({
      data: { entryId, definition: dto.definition, notes: dto.notes ?? null, order },
      select: { id: true, order: true, definition: true, notes: true },
    });
  }

  async updateSense(senseId: string, dto: UpdateSenseDto) {
    const sense = await this.prisma.sense.findUnique({ where: { id: senseId } });
    if (!sense) throw new NotFoundException("Sense not found");

    return this.prisma.sense.update({
      where: { id: senseId },
      data: {
        ...(dto.definition !== undefined && { definition: dto.definition }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.order !== undefined && { order: dto.order }),
      },
      select: { id: true, order: true, definition: true, notes: true },
    });
  }

  async deleteSense(senseId: string) {
    const sense = await this.prisma.sense.findUnique({ where: { id: senseId } });
    if (!sense) throw new NotFoundException("Sense not found");
    await this.prisma.sense.delete({ where: { id: senseId } });
  }

  // ─────────────────────────────────────────────────────
  // EXAMPLES
  // ─────────────────────────────────────────────────────

  async addExample(senseId: string, dto: CreateExampleDto) {
    const sense = await this.prisma.sense.findUnique({ where: { id: senseId } });
    if (!sense) throw new NotFoundException("Sense not found");

    return this.prisma.example.create({
      data: { senseId, text: dto.text, translation: dto.translation ?? null },
      select: { id: true, text: true, translation: true },
    });
  }

  async deleteExample(exampleId: string) {
    const example = await this.prisma.example.findUnique({ where: { id: exampleId } });
    if (!example) throw new NotFoundException("Example not found");
    await this.prisma.example.delete({ where: { id: exampleId } });
  }

  // ─────────────────────────────────────────────────────
  // EXPORT
  // ─────────────────────────────────────────────────────

  async exportEntries(ids?: string[]) {
    const where: Prisma.LemmaWhereInput = {
      headwords: { some: { entry: { source: DictionarySource.ADMIN } } },
    };
    if (ids?.length) where.id = { in: ids };

    const lemmas = await this.prisma.lemma.findMany({
      where,
      orderBy: { normalized: "asc" },
      include: {
        headwords: {
          where: { entry: { source: DictionarySource.ADMIN } },
          include: {
            entry: {
              select: {
                rawTranslate: true,
                notes: true,
                senses: {
                  orderBy: { order: "asc" },
                  select: {
                    order: true,
                    definition: true,
                    notes: true,
                    examples: { select: { text: true, translation: true } },
                  },
                },
              },
            },
          },
          take: 1,
        },
        morphForms: { select: { form: true, grammarTag: true } },
      },
    });

    return lemmas.map((l) => {
      const entry = l.headwords[0]?.entry;
      return {
        baseForm: l.baseForm,
        normalized: l.normalized,
        language: l.language,
        partOfSpeech: l.partOfSpeech,
        level: l.level,
        frequency: l.frequency,
        translation: entry?.rawTranslate ?? null,
        notes: entry?.notes ?? null,
        senses: entry?.senses ?? [],
        forms: l.morphForms.map((f) => f.form),
      };
    });
  }

  // ─────────────────────────────────────────────────────
  // IMPORT
  // ─────────────────────────────────────────────────────

  async importEntries(
    records: Array<{
      baseForm: string;
      normalized?: string;
      language: Language;
      partOfSpeech?: string;
      level?: Level;
      frequency?: number;
      translation: string;
      notes?: string;
      senses?: Array<{
        order?: number;
        definition: string;
        notes?: string;
        examples?: Array<{ text: string; translation?: string }>;
      }>;
      forms?: string[];
    }>,
    userId: string,
  ) {
    if (!records?.length) throw new BadRequestException("Empty import payload");

    let created = 0;
    let skipped = 0;

    for (const rec of records) {
      const normalized = rec.normalized ?? normalizeToken(rec.baseForm);

      const existing = await this.prisma.lemma.findUnique({
        where: { normalized_language: { normalized, language: rec.language } },
      });
      if (existing) { skipped++; continue; }

      await this.prisma.$transaction(async (tx) => {
        const lemma = await tx.lemma.create({
          data: {
            baseForm: rec.baseForm,
            normalized,
            language: rec.language,
            partOfSpeech: rec.partOfSpeech ?? null,
            level: rec.level ?? null,
            frequency: rec.frequency ?? null,
          },
        });

        const entry = await tx.dictionaryEntry.create({
          data: {
            rawWord: rec.baseForm,
            rawTranslate: rec.translation,
            source: DictionarySource.ADMIN,
            createdById: userId,
            notes: rec.notes ?? null,
          },
        });

        await tx.headword.create({
          data: { entryId: entry.id, text: rec.baseForm, normalized, lemmaId: lemma.id, order: 0 },
        });

        if (rec.senses?.length) {
          for (const s of rec.senses) {
            const sense = await tx.sense.create({
              data: {
                entryId: entry.id,
                definition: s.definition,
                notes: s.notes ?? null,
                order: s.order ?? 0,
              },
            });
            if (s.examples?.length) {
              await tx.example.createMany({
                data: s.examples.map((ex) => ({
                  senseId: sense.id,
                  text: ex.text,
                  translation: ex.translation ?? null,
                })),
              });
            }
          }
        }

        if (rec.forms?.length) {
          await tx.morphForm.createMany({
            data: rec.forms.map((form) => ({
              form,
              normalized: normalizeToken(form),
              lemmaId: lemma.id,
            })),
            skipDuplicates: true,
          });
        }
      });

      created++;
    }

    return { created, skipped, total: records.length };
  }

  // ─────────────────────────────────────────────────────
  // INTERNAL (pipeline usage)
  // ─────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────
  // HEADWORDS
  // ─────────────────────────────────────────────────────

  async addHeadword(lemmaId: string, dto: CreateHeadwordDto) {
    const entryId = await this.getEntryIdForLemma(lemmaId);
    const normalized = normalizeToken(dto.word);

    const maxOrder = await this.prisma.headword.aggregate({
      where: { entryId },
      _max: { order: true },
    });
    const order = (maxOrder._max.order ?? -1) + 1;

    if (dto.isPrimary) {
      await this.prisma.headword.updateMany({
        where: { entryId },
        data: { isPrimary: false },
      });
    }

    return this.prisma.headword.create({
      data: { entryId, lemmaId, text: dto.word, normalized, order, isPrimary: dto.isPrimary ?? false },
      select: { id: true, text: true, normalized: true, isPrimary: true, order: true },
    });
  }

  async deleteHeadword(hwId: string) {
    const hw = await this.prisma.headword.findUnique({ where: { id: hwId } });
    if (!hw) throw new NotFoundException("Headword not found");
    if (hw.isPrimary) throw new BadRequestException("Cannot delete the primary headword");
    await this.prisma.headword.delete({ where: { id: hwId } });
  }

  // ─────────────────────────────────────────────────────
  // MORPH FORMS (individual CRUD)
  // ─────────────────────────────────────────────────────

  async addMorphForm(lemmaId: string, dto: CreateMorphFormDto) {
    const lemma = await this.prisma.lemma.findFirst({
      where: { id: lemmaId, headwords: { some: { entry: { source: DictionarySource.ADMIN } } } },
      select: { id: true },
    });
    if (!lemma) throw new NotFoundException("Dictionary entry not found");

    const normalized = normalizeToken(dto.form);

    return this.prisma.morphForm.create({
      data: {
        form: dto.form,
        normalized,
        lemmaId,
        gramCase: dto.gramCase ?? null,
        gramNumber: dto.gramNumber ?? null,
        grammarTag: dto.grammarTag ?? null,
      },
      select: { id: true, form: true, normalized: true, gramCase: true, gramNumber: true, grammarTag: true },
    });
  }

  async updateMorphForm(formId: string, dto: UpdateMorphFormDto) {
    const form = await this.prisma.morphForm.findUnique({ where: { id: formId } });
    if (!form) throw new NotFoundException("Morph form not found");

    return this.prisma.morphForm.update({
      where: { id: formId },
      data: {
        ...(dto.form !== undefined && { form: dto.form, normalized: normalizeToken(dto.form) }),
        ...(dto.gramCase !== undefined && { gramCase: dto.gramCase }),
        ...(dto.gramNumber !== undefined && { gramNumber: dto.gramNumber }),
        ...(dto.grammarTag !== undefined && { grammarTag: dto.grammarTag }),
      },
      select: { id: true, form: true, normalized: true, gramCase: true, gramNumber: true, grammarTag: true },
    });
  }

  async deleteMorphForm(formId: string) {
    const form = await this.prisma.morphForm.findUnique({ where: { id: formId } });
    if (!form) throw new NotFoundException("Morph form not found");
    await this.prisma.morphForm.delete({ where: { id: formId } });
  }

  // ─────────────────────────────────────────────────────
  // EXAMPLES (update)
  // ─────────────────────────────────────────────────────

  async updateExample(exampleId: string, dto: UpdateExampleDto) {
    const example = await this.prisma.example.findUnique({ where: { id: exampleId } });
    if (!example) throw new NotFoundException("Example not found");

    return this.prisma.example.update({
      where: { id: exampleId },
      data: {
        ...(dto.text !== undefined && { text: dto.text }),
        ...(dto.translation !== undefined && { translation: dto.translation }),
      },
      select: { id: true, text: true, translation: true },
    });
  }

  // ─────────────────────────────────────────────────────
  // NAVIGATION (prev / next)
  // ─────────────────────────────────────────────────────

  async getNextEntry(lemmaId: string) {
    const current = await this.prisma.lemma.findUnique({
      where: { id: lemmaId },
      select: { normalized: true },
    });
    if (!current) throw new NotFoundException("Entry not found");

    return this.prisma.lemma.findFirst({
      where: {
        normalized: { gt: current.normalized },
        headwords: { some: { entry: { source: DictionarySource.ADMIN } } },
      },
      orderBy: { normalized: "asc" },
      select: { id: true, baseForm: true, normalized: true },
    });
  }

  async getPrevEntry(lemmaId: string) {
    const current = await this.prisma.lemma.findUnique({
      where: { id: lemmaId },
      select: { normalized: true },
    });
    if (!current) throw new NotFoundException("Entry not found");

    return this.prisma.lemma.findFirst({
      where: {
        normalized: { lt: current.normalized },
        headwords: { some: { entry: { source: DictionarySource.ADMIN } } },
      },
      orderBy: { normalized: "desc" },
      select: { id: true, baseForm: true, normalized: true },
    });
  }

  // ─────────────────────────────────────────────────────
  // USER STATS
  // ─────────────────────────────────────────────────────

  async getUserStatsForEntry(lemmaId: string) {
    const [totalAdded, countNew, countLearning, countKnown] = await Promise.all([
      this.prisma.userDictionaryEntry.count({ where: { lemmaId } }),
      this.prisma.userDictionaryEntry.count({ where: { lemmaId, learningLevel: WordStatus.NEW } }),
      this.prisma.userDictionaryEntry.count({ where: { lemmaId, learningLevel: WordStatus.LEARNING } }),
      this.prisma.userDictionaryEntry.count({ where: { lemmaId, learningLevel: WordStatus.KNOWN } }),
    ]);
    return { totalAdded, countNew, countLearning, countKnown };
  }

  // ─────────────────────────────────────────────────────
  // CORPUS CONTEXTS
  // ─────────────────────────────────────────────────────

  async getContextsForEntry(lemmaId: string, limit = 20) {
    const lemma = await this.prisma.lemma.findUnique({
      where: { id: lemmaId },
      select: { id: true },
    });
    if (!lemma) throw new NotFoundException("Entry not found");

    const contexts = await this.prisma.wordContext.findMany({
      where: { lemmaId },
      orderBy: { seenAt: "desc" },
      take: limit,
      distinct: ["textId"],
      include: {
        text: { select: { id: true, title: true } },
      },
    });

    const total = await this.prisma.wordContext.count({ where: { lemmaId } });

    return {
      total,
      items: contexts.map((c) => ({
        id: c.id,
        word: c.word,
        snippet: c.snippet ?? null,
        textId: c.textId,
        textTitle: c.text.title,
        seenAt: c.seenAt,
      })),
    };
  }

  // ─────────────────────────────────────────────────────
  // INTERNAL (pipeline usage)
  // ─────────────────────────────────────────────────────

  async findWords(
    words: string[],
    language?: Language,
  ): Promise<Map<string, { lemmaId: string }>> {
    if (!words.length) return new Map();

    const unique = [...new Set(words)];

    const entries = await this.prisma.dictionaryEntry.findMany({
      where: {
        source: DictionarySource.ADMIN,
        headwords: {
          some: {
            normalized: { in: unique },
            ...(language ? { lemma: { language } } : {}),
          },
        },
      },
      include: {
        headwords: {
          include: { lemma: { select: { language: true } } },
        },
      },
    });

    const map = new Map<string, { lemmaId: string }>();
    for (const entry of entries) {
      for (const h of entry.headwords) {
        if (h.lemmaId && (!language || h.lemma?.language === language)) {
          map.set(h.normalized, { lemmaId: h.lemmaId });
        }
      }
    }
    return map;
  }
}
