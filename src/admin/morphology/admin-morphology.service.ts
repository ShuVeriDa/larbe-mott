import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { normalizeToken } from "src/markup-engine/tokenizer/tokenizer.utils";
import { MorphologyService } from "src/markup-engine/morphology/morphology.service";
import { PrismaService } from "src/prisma.service";
import { AnalyzeWordDto } from "./dto/analyze-word.dto";
import { CreateLemmaDto } from "./dto/create-lemma.dto";
import { CreateMorphFormDto } from "./dto/create-morph-form.dto";
import { FetchLemmasDto } from "./dto/fetch-lemmas.dto";
import { UpdateLemmaDto } from "./dto/update-lemma.dto";
import { UpdateMorphFormDto } from "./dto/update-morph-form.dto";

@Injectable()
export class AdminMorphologyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly morphology: MorphologyService,
  ) {}

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
    return this.prisma.morphForm.update({ where: { id: formId }, data });
  }

  async deleteMorphForm(formId: string) {
    const form = await this.prisma.morphForm.findUnique({
      where: { id: formId },
    });
    if (!form) throw new NotFoundException("Morph form not found");
    await this.prisma.morphForm.delete({ where: { id: formId } });
  }

  async analyzeWord(dto: AnalyzeWordDto) {
    const result = await this.morphology.analyze(dto.word);
    return { word: dto.word, result };
  }
}
