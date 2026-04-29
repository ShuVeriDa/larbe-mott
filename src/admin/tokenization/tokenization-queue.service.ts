import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { JobStatus, ProcessingTrigger } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { ProcessTextOpts, TokenizerProcessor } from "src/markup-engine/tokenizer/tokenizer.processor";
import { TokenizationEventsService } from "./tokenization-events.service";

const MAX_CONCURRENCY = 2;

@Injectable()
export class TokenizationQueueService implements OnModuleInit {
  private readonly logger = new Logger(TokenizationQueueService.name);
  private runningCount = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly processor: TokenizerProcessor,
    private readonly events: TokenizationEventsService,
  ) {}

  async onModuleInit() {
    // Сбросить зависшие RUNNING-задачи в FAILED после перезапуска
    const stale = await this.prisma.tokenizationJob.updateMany({
      where: { status: JobStatus.RUNNING },
      data: { status: JobStatus.FAILED, finishedAt: new Date(), error: "Прервано перезапуском сервера" },
    });
    if (stale.count) {
      this.logger.warn(`Сброшено ${stale.count} зависших задач в FAILED`);
    }

    // Переназначить queuePosition для PENDING
    await this._reorderQueue();

    // Запустить дренаж очереди
    void this._drain();
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  async enqueue(
    textIds: string[],
    opts: Pick<ProcessTextOpts, "trigger" | "initiatorId"> = {},
  ): Promise<{ started: number; textIds: string[] }> {
    if (!textIds.length) return { started: 0, textIds: [] };

    const trigger = opts.trigger ?? ProcessingTrigger.MANUAL;
    const initiatorId = opts.initiatorId ?? null;

    // Не добавляем дублирующие PENDING/RUNNING задачи
    const existing = await this.prisma.tokenizationJob.findMany({
      where: { textId: { in: textIds }, status: { in: [JobStatus.PENDING, JobStatus.RUNNING] } },
      select: { textId: true },
    });
    const existingIds = new Set(existing.map((j) => j.textId));
    const toEnqueue = textIds.filter((id) => !existingIds.has(id));

    if (toEnqueue.length) {
      const maxPos = await this.prisma.tokenizationJob.aggregate({
        where: { status: JobStatus.PENDING },
        _max: { queuePosition: true },
      });
      let pos = (maxPos._max.queuePosition ?? 0) + 1;

      await this.prisma.tokenizationJob.createMany({
        data: toEnqueue.map((textId) => ({
          textId,
          status: JobStatus.PENDING,
          queuePosition: pos++,
          trigger,
          initiatorId,
        })),
      });

      this._emitQueueChanged();
      void this._drain();
    }

    return { started: toEnqueue.length, textIds: toEnqueue };
  }

  async cancel(textId: string): Promise<boolean> {
    const job = await this.prisma.tokenizationJob.findFirst({
      where: { textId, status: { in: [JobStatus.PENDING, JobStatus.RUNNING] } },
      orderBy: { createdAt: "desc" },
    });
    if (!job) return false;

    if (job.status === JobStatus.PENDING) {
      await this.prisma.tokenizationJob.update({
        where: { id: job.id },
        data: { status: JobStatus.CANCELLED, finishedAt: new Date() },
      });
      await this._reorderQueue();
      this._emitQueueChanged();
      return true;
    }

    // RUNNING — нельзя остановить через очередь, только пометим Text как IDLE
    await this.prisma.text.update({
      where: { id: textId },
      data: { processingStatus: "IDLE", processingProgress: 0 },
    });
    return true;
  }

  async getQueue() {
    const jobs = await this.prisma.tokenizationJob.findMany({
      where: { status: { in: [JobStatus.RUNNING, JobStatus.PENDING] } },
      orderBy: { queuePosition: "asc" },
      include: { text: { select: { title: true, processingProgress: true } } },
    });

    return {
      items: jobs.map((j) => ({
        jobId: j.id,
        textId: j.textId,
        title: j.text.title,
        progress: j.status === JobStatus.RUNNING ? j.text.processingProgress : 0,
        queueStatus: j.status as "RUNNING" | "PENDING",
        queuePosition: j.status === JobStatus.PENDING ? j.queuePosition : null,
      })),
      count: jobs.length,
    };
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private async _drain() {
    while (this.runningCount < MAX_CONCURRENCY) {
      const job = await this.prisma.tokenizationJob.findFirst({
        where: { status: JobStatus.PENDING },
        orderBy: { queuePosition: "asc" },
      });
      if (!job) break;

      await this.prisma.tokenizationJob.update({
        where: { id: job.id },
        data: { status: JobStatus.RUNNING, startedAt: new Date(), queuePosition: null },
      });
      await this._reorderQueue();
      this._emitQueueChanged();

      this.runningCount++;
      void this._runJob(job.id, job.textId, job.trigger, job.initiatorId);
    }
  }

  private async _runJob(
    jobId: string,
    textId: string,
    trigger: ProcessingTrigger,
    initiatorId: string | null,
  ) {
    try {
      await this.processor.processText(textId, { trigger, initiatorId: initiatorId ?? undefined });
      await this.prisma.tokenizationJob.update({
        where: { id: jobId },
        data: { status: JobStatus.COMPLETED, finishedAt: new Date() },
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      await this.prisma.tokenizationJob.update({
        where: { id: jobId },
        data: { status: JobStatus.FAILED, finishedAt: new Date(), error },
      });
      this.logger.error(`Задача ${jobId} (textId=${textId}) завершилась с ошибкой: ${error}`);
    } finally {
      this.runningCount = Math.max(0, this.runningCount - 1);
      this._emitQueueChanged();
      void this._drain();
    }
  }

  private async _reorderQueue() {
    const pending = await this.prisma.tokenizationJob.findMany({
      where: { status: JobStatus.PENDING },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    for (let i = 0; i < pending.length; i++) {
      await this.prisma.tokenizationJob.update({
        where: { id: pending[i].id },
        data: { queuePosition: i + 1 },
      });
    }
  }

  private _emitQueueChanged() {
    // fire-and-forget snapshot для SSE
    void this.getQueue().then((q) => this.events.emit("queue_changed", { queue: q }));
  }
}
