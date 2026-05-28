import { Injectable, NotFoundException } from "@nestjs/common";
import { AiCacheStatus } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { ErrorCode } from "src/common/errors/error-codes";

export interface FetchAiCacheQuery {
  status?: AiCacheStatus;
  q?: string;
  targetLanguage?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class AdminAiCacheService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const [pending, approved, rejected, approvedNotExported, topWords] =
      await Promise.all([
        this.prisma.aiTranslationCache.count({
          where: { status: AiCacheStatus.PENDING },
        }),
        this.prisma.aiTranslationCache.count({
          where: {
            status: AiCacheStatus.APPROVED,
            updatedAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) },
          },
        }),
        this.prisma.aiTranslationCache.count({
          where: { status: AiCacheStatus.REJECTED },
        }),
        this.prisma.aiTranslationCache.count({
          where: { status: AiCacheStatus.APPROVED, exportedAt: null },
        }),
        this.prisma.aiTranslationCache.findMany({
          where: {
            status: { in: [AiCacheStatus.PENDING, AiCacheStatus.APPROVED] },
          },
          orderBy: { requestCount: "desc" },
          take: 10,
          select: {
            lemma: true,
            requestCount: true,
            translation: true,
            status: true,
          },
        }),
      ]);
    return {
      pending,
      approvedThisWeek: approved,
      rejected,
      approvedNotExported,
      topWords,
    };
  }

  async list(query: FetchAiCacheQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? { lemma: { contains: query.q, mode: "insensitive" as const } }
        : {}),
      ...(query.targetLanguage ? { targetLanguage: query.targetLanguage } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.aiTranslationCache.findMany({
        where,
        orderBy: { requestCount: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          lemma: true,
          cacheType: true,
          targetLanguage: true,
          translation: true,
          russianGloss: true,
          transliteration: true,
          partOfSpeech: true,
          example: true,
          status: true,
          requestCount: true,
          thumbsUp: true,
          thumbsDown: true,
          exportedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.aiTranslationCache.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async approve(id: string) {
    const entry = await this.prisma.aiTranslationCache.findUnique({
      where: { id },
    });
    if (!entry) throw new NotFoundException({ code: ErrorCode.AI_CACHE_ENTRY_NOT_FOUND, message: "AI cache entry not found" });
    return this.prisma.aiTranslationCache.update({
      where: { id },
      data: { status: AiCacheStatus.APPROVED },
    });
  }

  async reject(id: string) {
    const entry = await this.prisma.aiTranslationCache.findUnique({
      where: { id },
    });
    if (!entry) throw new NotFoundException({ code: ErrorCode.AI_CACHE_ENTRY_NOT_FOUND, message: "AI cache entry not found" });
    return this.prisma.aiTranslationCache.update({
      where: { id },
      data: { status: AiCacheStatus.REJECTED },
    });
  }

  async remove(id: string) {
    const entry = await this.prisma.aiTranslationCache.findUnique({
      where: { id },
    });
    if (!entry) throw new NotFoundException({ code: ErrorCode.AI_CACHE_ENTRY_NOT_FOUND, message: "AI cache entry not found" });
    await this.prisma.aiTranslationCache.delete({ where: { id } });
  }

  async getAiHint(
    adminUserId: string,
    lemma: string,
  ): Promise<{
    translation: string;
    transliteration?: string;
    partOfSpeech?: string;
    example?: string;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: adminUserId },
      select: { geminiApiKeyEncrypted: true },
    });
    if (!user?.geminiApiKeyEncrypted) {
      throw new NotFoundException({ code: ErrorCode.ADMIN_GEMINI_KEY_NOT_CONFIGURED, message: "Admin Gemini API key not configured" });
    }

    const { decryptApiKey } =
      await import("../../ai-translation/encryption.util.js");
    const { geminiUrl } =
      await import("../../ai-translation/gemini.util.js");
    const apiKey = decryptApiKey(user.geminiApiKeyEncrypted);

    const prompt = `You are a Chechen-Russian language assistant. Translate the Chechen word "${lemma}" into Russian. Return JSON:
- "translation": string
- "transliteration": string (Latin)
- "partOfSpeech": string (in Russian)
- "example": string (short usage example: "Chechen — Russian")
Return only valid JSON.`;

    const url = geminiUrl(apiKey);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const clean = raw
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    return JSON.parse(clean);
  }
}
