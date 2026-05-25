import { Injectable, NotFoundException } from "@nestjs/common";
import { ErrorCode } from "src/common/errors/error-codes";
import { PrismaService } from "src/prisma.service";

export const SUPPORTED_LANGS = ["ru", "che", "en", "ar"] as const;
export type LegalLang = (typeof SUPPORTED_LANGS)[number];
export const DEFAULT_LANG: LegalLang = "ru";

export function normalizeLang(input?: string): LegalLang {
  return (SUPPORTED_LANGS as readonly string[]).includes(input ?? "")
    ? (input as LegalLang)
    : DEFAULT_LANG;
}

@Injectable()
export class LegalService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Возвращает опубликованный документ по slug+lang.
   * Если в запрошенном языке документа нет — фолбэчит на DEFAULT_LANG.
   * Если и его нет — 404.
   */
  async getPublishedBySlug(slug: string, lang: string) {
    const requested = normalizeLang(lang);

    const direct = await this.prisma.legalDocument.findFirst({
      where: { slug, lang: requested, isPublished: true },
    });
    if (direct) return this.toPublic(direct);

    if (requested !== DEFAULT_LANG) {
      const fallback = await this.prisma.legalDocument.findFirst({
        where: { slug, lang: DEFAULT_LANG, isPublished: true },
      });
      if (fallback) return this.toPublic(fallback);
    }

    throw new NotFoundException({ code: ErrorCode.LEGAL_DOCUMENT_NOT_FOUND, message: `Legal document "${slug}" not found` });
  }

  private toPublic(doc: {
    slug: string;
    lang: string;
    title: string;
    content: string;
    version: number;
    publishedAt: Date | null;
    updatedAt: Date;
  }) {
    return {
      slug: doc.slug,
      lang: doc.lang,
      title: doc.title,
      content: doc.content,
      version: doc.version,
      publishedAt: doc.publishedAt,
      updatedAt: doc.updatedAt,
    };
  }
}
