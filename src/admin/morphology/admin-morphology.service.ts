import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Language, MorphRuleType, Prisma } from "@prisma/client";
import { normalizeToken } from "src/markup-engine/tokenizer/tokenizer.utils";
import { MorphologyRuleEngine } from "src/markup-engine/morphology/rule-engine.service";
import { MorphologyService } from "src/markup-engine/morphology/morphology.service";
import { PrismaService } from "src/prisma.service";
import { AnalyzeWordDto } from "./dto/analyze-word.dto";
import { BulkRulesDto } from "./dto/bulk-rules.dto";
import { CreateLemmaDto } from "./dto/create-lemma.dto";
import { CreateMorphFormDto } from "./dto/create-morph-form.dto";
import { CreateMorphologyRuleDto } from "./dto/create-morphology-rule.dto";
import { FetchLemmasDto } from "./dto/fetch-lemmas.dto";
import { FetchRulesDto } from "./dto/fetch-rules.dto";
import { UpdateLemmaDto } from "./dto/update-lemma.dto";
import { UpdateMorphFormDto } from "./dto/update-morph-form.dto";
import { UpdateMorphologyRuleDto } from "./dto/update-morphology-rule.dto";

@Injectable()
export class AdminMorphologyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly morphology: MorphologyService,
    private readonly ruleEngine: MorphologyRuleEngine,
  ) {}

  // ─── Lemmas ────────────────────────────────────────────────────────────────

  async getLemmas(query: FetchLemmasDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.LemmaWhereInput = {};
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { baseForm: { contains: q, mode: "insensitive" } },
        { normalized: { contains: q, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.lemma.findMany({
        where,
        skip,
        take: limit,
        orderBy: { baseForm: "asc" },
        include: { _count: { select: { morphForms: true } } },
      }),
      this.prisma.lemma.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getLemmaById(id: string) {
    const lemma = await this.prisma.lemma.findUnique({
      where: { id },
      include: { morphForms: { orderBy: { form: "asc" } } },
    });
    if (!lemma) throw new NotFoundException("Lemma not found");
    return lemma;
  }

  async createLemma(dto: CreateLemmaDto) {
    const normalized = normalizeToken(dto.baseForm);
    const existing = await this.prisma.lemma.findUnique({
      where: { normalized_language: { normalized, language: dto.language } },
    });
    if (existing) {
      throw new ConflictException(
        `Lemma "${normalized}" (${dto.language}) already exists`,
      );
    }
    return this.prisma.lemma.create({
      data: {
        baseForm: dto.baseForm,
        normalized,
        language: dto.language,
        partOfSpeech: dto.partOfSpeech,
        frequency: dto.frequency,
      },
    });
  }

  async updateLemma(id: string, dto: UpdateLemmaDto) {
    await this.getLemmaById(id);
    const data: Prisma.LemmaUpdateInput = {};
    if (dto.baseForm !== undefined) {
      data.baseForm = dto.baseForm;
      data.normalized = normalizeToken(dto.baseForm);
    }
    if (dto.partOfSpeech !== undefined) data.partOfSpeech = dto.partOfSpeech;
    if (dto.frequency !== undefined) data.frequency = dto.frequency;
    return this.prisma.lemma.update({ where: { id }, data });
  }

  async deleteLemma(id: string) {
    await this.getLemmaById(id);
    await this.prisma.lemma.delete({ where: { id } });
  }

  // ─── Morph forms ───────────────────────────────────────────────────────────

  async addMorphForm(lemmaId: string, dto: CreateMorphFormDto) {
    await this.getLemmaById(lemmaId);
    const normalized = normalizeToken(dto.form);
    const existing = await this.prisma.morphForm.findUnique({
      where: { normalized_lemmaId: { normalized, lemmaId } },
    });
    if (existing) {
      throw new ConflictException(
        `Form "${normalized}" already exists for this lemma`,
      );
    }
    return this.prisma.morphForm.create({
      data: {
        form: dto.form,
        normalized,
        grammarTag: dto.grammarTag,
        lemmaId,
      },
    });
  }

  async updateMorphForm(formId: string, dto: UpdateMorphFormDto) {
    const form = await this.prisma.morphForm.findUnique({
      where: { id: formId },
    });
    if (!form) throw new NotFoundException("Morph form not found");

    const data: Prisma.MorphFormUpdateInput = {};
    if (dto.form !== undefined) {
      data.form = dto.form;
      data.normalized = normalizeToken(dto.form);
    }
    if (dto.grammarTag !== undefined) data.grammarTag = dto.grammarTag;

    try {
      return await this.prisma.morphForm.update({ where: { id: formId }, data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException("A form with this normalized value already exists for this lemma");
      }
      throw e;
    }
  }

  async deleteMorphForm(formId: string) {
    const form = await this.prisma.morphForm.findUnique({
      where: { id: formId },
    });
    if (!form) throw new NotFoundException("Morph form not found");
    await this.prisma.morphForm.delete({ where: { id: formId } });
  }

  // ─── Analysis ──────────────────────────────────────────────────────────────

  async analyzeWord(dto: AnalyzeWordDto) {
    const result = await this.morphology.analyze(dto.word);
    return { word: dto.word, result };
  }

  // ─── Morphology Rules ──────────────────────────────────────────────────────

  async getRulesStats() {
    const [total, inactive, regexCount, matchesAgg, coveredTokens, totalTokens] =
      await Promise.all([
        this.prisma.morphologyRule.count(),
        this.prisma.morphologyRule.count({ where: { isActive: false } }),
        this.prisma.morphologyRule.count({ where: { isRegex: true } }),
        this.prisma.morphologyRule.aggregate({ _sum: { matchCount: true } }),
        this.prisma.tokenAnalysis.count({ where: { lemmaId: { not: null } } }),
        this.prisma.tokenAnalysis.count(),
      ]);

    const coveragePct =
      totalTokens > 0
        ? parseFloat(((coveredTokens / totalTokens) * 100).toFixed(1))
        : 0;

    return {
      total,
      active: total - inactive,
      inactive,
      regexCount,
      totalMatches: matchesAgg._sum.matchCount ?? 0,
      coveragePct,
    };
  }

  async getRules(query: FetchRulesDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 50));
    const skip = (page - 1) * limit;

    const where: Prisma.MorphologyRuleWhereInput = {};

    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { suffix: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }
    if (query.pos) where.pos = { equals: query.pos, mode: "insensitive" };
    if (query.type) where.type = query.type;
    if (query.language) where.language = query.language;

    if (query.status === "active") where.isActive = true;
    else if (query.status === "inactive") where.isActive = false;
    else if (query.status === "regex") where.isRegex = true;

    const [items, total] = await Promise.all([
      this.prisma.morphologyRule.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ priority: "desc" }, { suffix: "asc" }],
      }),
      this.prisma.morphologyRule.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async createRule(dto: CreateMorphologyRuleDto) {
    const existing = await this.prisma.morphologyRule.findUnique({
      where: {
        suffix_type_language: {
          suffix: dto.suffix,
          type: dto.type,
          language: dto.language,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Rule "${dto.suffix}" (${dto.type}/${dto.language}) already exists`,
      );
    }
    const rule = await this.prisma.morphologyRule.create({
      data: {
        suffix: dto.suffix,
        add: dto.add,
        pos: dto.pos,
        description: dto.description,
        isRegex: dto.isRegex ?? dto.type === MorphRuleType.REGEX,
        type: dto.type,
        language: dto.language,
        priority: dto.priority ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    await this.ruleEngine.reloadRules();
    return rule;
  }

  async updateRule(id: string, dto: UpdateMorphologyRuleDto) {
    const rule = await this.prisma.morphologyRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException("Rule not found");

    const data: Prisma.MorphologyRuleUpdateInput = { ...dto };
    if (dto.type === MorphRuleType.REGEX) data.isRegex = true;

    const updated = await this.prisma.morphologyRule.update({ where: { id }, data });
    await this.ruleEngine.reloadRules();
    return updated;
  }

  async deleteRule(id: string) {
    const rule = await this.prisma.morphologyRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException("Rule not found");
    await this.prisma.morphologyRule.delete({ where: { id } });
    await this.ruleEngine.reloadRules();
  }

  // ─── Bulk operations ───────────────────────────────────────────────────────

  async bulkActivateRules(dto: BulkRulesDto) {
    const { count } = await this.prisma.morphologyRule.updateMany({
      where: { id: { in: dto.ids } },
      data: { isActive: true },
    });
    await this.ruleEngine.reloadRules();
    return { updated: count };
  }

  async bulkDeactivateRules(dto: BulkRulesDto) {
    const { count } = await this.prisma.morphologyRule.updateMany({
      where: { id: { in: dto.ids } },
      data: { isActive: false },
    });
    await this.ruleEngine.reloadRules();
    return { updated: count };
  }

  async bulkDeleteRules(dto: BulkRulesDto) {
    const { count } = await this.prisma.morphologyRule.deleteMany({
      where: { id: { in: dto.ids } },
    });
    await this.ruleEngine.reloadRules();
    return { deleted: count };
  }

  // ─── Import ────────────────────────────────────────────────────────────────

  async importRules(
    file: Express.Multer.File,
    overwrite: boolean,
    defaultLanguage: Language = Language.CHE,
  ) {
    if (!file?.buffer) throw new BadRequestException("File is required");

    const content = file.buffer.toString("utf-8");
    let rows: Array<Record<string, string>> = [];

    const isJson =
      file.mimetype === "application/json" ||
      file.originalname.endsWith(".json");

    if (isJson) {
      rows = JSON.parse(content);
    } else {
      const lines = content.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) throw new BadRequestException("CSV file is empty or has no data rows");
      const headers = lines[0].split(",").map((h) => h.trim());
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(",").map((v) => v.trim());
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = vals[idx] ?? ""; });
        rows.push(row);
      }
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const suffix = row.pattern ?? row.suffix ?? row.remove ?? "";
      const type = row.type as MorphRuleType;
      const language = (row.language as Language) ?? defaultLanguage;

      if (!suffix || !type) {
        errors.push(`Row ${i + 1}: missing suffix or type`);
        skipped++;
        continue;
      }

      if (!Object.values(MorphRuleType).includes(type)) {
        errors.push(`Row ${i + 1}: unknown type "${type}"`);
        skipped++;
        continue;
      }

      const priority = row.priority ? parseInt(row.priority, 10) : 0;
      const isRegex = row.isRegex === "true" || type === MorphRuleType.REGEX;

      try {
        const existing = await this.prisma.morphologyRule.findUnique({
          where: { suffix_type_language: { suffix, type, language } },
        });

        if (existing) {
          if (overwrite) {
            await this.prisma.morphologyRule.update({
              where: { id: existing.id },
              data: {
                add: row.add || null,
                pos: row.pos || null,
                description: row.description || null,
                priority,
                isRegex,
              },
            });
            updated++;
          } else {
            skipped++;
          }
        } else {
          await this.prisma.morphologyRule.create({
            data: {
              suffix,
              add: row.add || null,
              pos: row.pos || null,
              description: row.description || null,
              isRegex,
              type,
              language,
              priority,
              isActive: row.isActive !== "false",
            },
          });
          created++;
        }
      } catch {
        errors.push(`Row ${i + 1}: failed to save rule "${suffix}"`);
        skipped++;
      }
    }

    await this.ruleEngine.reloadRules();
    return { created, updated, skipped, total: rows.length, errors };
  }
}
