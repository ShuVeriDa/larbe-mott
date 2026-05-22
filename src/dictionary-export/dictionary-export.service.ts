import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";
import { AiCacheStatus } from "@prisma/client";
import axios, { AxiosError } from "axios";
import { PrismaService } from "src/prisma.service";

const BATCH_SIZE = 50;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export interface ExportResult {
  created: number;
  skipped: number;
  total: number;
  errors: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Sanitize Authorization / API key values from error messages before logging
const sanitizeErrorMessage = (msg: string): string =>
  msg.replace(/([Xx]-[Aa]pi-[Kk]ey:\s*)\S+/g, "$1[REDACTED]")
     .replace(/(Bearer\s+)\S+/g, "$1[REDACTED]")
     .replace(/(api[_-]?key[=:\s]+)\S+/gi, "$1[REDACTED]");

@Injectable()
export class DictionaryExportService {
  private readonly logger = new Logger(DictionaryExportService.name);

  // In-memory guard: prevent concurrent exports (one process, one instance)
  private exportInProgress = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Cron("0 4 * * *", { name: "dictionary-export" })
  async scheduledExport() {
    this.logger.log("Running scheduled dictionary export");
    try {
      const result = await this.exportApproved("cron");
      this.logger.log(
        `Dictionary export done: created=${result.created} skipped=${result.skipped} errors=${result.errors}`,
      );
    } catch (err) {
      this.logger.error(
        "Dictionary export cron failed",
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  async exportApproved(triggeredBy: "cron" | "manual" = "manual"): Promise<ExportResult> {
    // Race condition guard: reject concurrent calls
    if (this.exportInProgress) {
      this.logger.warn("Export already in progress — skipping duplicate request");
      return { created: 0, skipped: 0, total: 0, errors: 0 };
    }
    this.exportInProgress = true;

    try {
      return await this._runExport(triggeredBy);
    } finally {
      this.exportInProgress = false;
    }
  }

  private async _runExport(triggeredBy: "cron" | "manual"): Promise<ExportResult> {
    const apiUrl = this.config.get<string>("DICTIONARY_API_URL");
    const apiKey = this.config.get<string>("DICTIONARY_API_KEY");

    if (!apiKey) {
      this.logger.warn("DICTIONARY_API_KEY not set — skipping export");
      return { created: 0, skipped: 0, total: 0, errors: 0 };
    }

    const run = await this.prisma.dictionaryExportRun.create({
      data: { triggeredBy, status: "running" },
    });

    // Count total before iteration so we can report it even if nothing fetched
    const total = await this.prisma.aiTranslationCache.count({
      where: { status: AiCacheStatus.APPROVED, exportedAt: null },
    });

    if (total === 0) {
      await this.prisma.dictionaryExportRun.update({
        where: { id: run.id },
        data: { finishedAt: new Date(), status: "ok", total: 0 },
      });
      return { created: 0, skipped: 0, total: 0, errors: 0 };
    }

    let created = 0;
    let skipped = 0;
    let errors = 0;
    let cursor: string | undefined = undefined;

    // Cursor-based pagination: never load the full table into memory at once
    while (true) {
      const batch = await this.prisma.aiTranslationCache.findMany({
        where: { status: AiCacheStatus.APPROVED, exportedAt: null },
        orderBy: { id: "asc" },
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: {
          id: true,
          lemma: true,
          translation: true,
          transliteration: true,
          partOfSpeech: true,
          example: true,
        },
      });

      if (batch.length === 0) break;
      cursor = batch[batch.length - 1].id;

      const entries = batch.map((r) => ({
        word: r.lemma,
        translation: r.translation,
        transliteration: r.transliteration ?? undefined,
        partOfSpeech: r.partOfSpeech ?? undefined,
        example: r.example ?? undefined,
        source: "mott-larbe-ai",
      }));

      let batchResult: { created: number; skipped: number } | null = null;
      let lastError: string | undefined;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const { data } = await axios.post<{ created: number; skipped: number; total: number }>(
            `${apiUrl}/admin/entries/direct-import`,
            { entries },
            {
              headers: { "X-Api-Key": apiKey },
              timeout: 15_000,
              // Prevent axios from echoing headers in error objects
              transformRequest: [(data, headers) => {
                return JSON.stringify(data);
              }],
            },
          );
          batchResult = { created: data.created, skipped: data.skipped };
          lastError = undefined;
          break;
        } catch (err) {
          const rawMsg = err instanceof AxiosError
            ? `${err.response?.status ?? "network"}: ${err.message}`
            : String(err);
          const safeMsg = sanitizeErrorMessage(rawMsg);
          this.logger.warn(
            `Batch export attempt ${attempt}/${MAX_RETRIES} failed (cursor ${cursor}): ${safeMsg}`,
          );
          lastError = safeMsg;
          if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS * attempt);
        }
      }

      if (batchResult) {
        created += batchResult.created;
        skipped += batchResult.skipped;
        await this.prisma.aiTranslationCache.updateMany({
          where: { id: { in: batch.map((r) => r.id) } },
          data: { exportedAt: new Date() },
        });
      } else {
        this.logger.error(`Batch permanently failed (cursor ${cursor}): ${lastError}`);
        errors += batch.length;
        // Skip over failed batch so we don't retry the same records infinitely
        // They remain exportedAt=null and will be picked up on the next run
      }
    }

    const finalStatus = errors === 0 ? "ok" : errors === total ? "error" : "ok";
    await this.prisma.dictionaryExportRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: finalStatus,
        created,
        skipped,
        errors,
        total,
        errorMessage: errors > 0 ? `${errors} entries failed after ${MAX_RETRIES} retries` : null,
      },
    });

    return { created, skipped, total, errors };
  }

  async getExportRuns(limit = 10) {
    return this.prisma.dictionaryExportRun.findMany({
      orderBy: { startedAt: "desc" },
      take: Math.min(limit, 50),
    });
  }
}
