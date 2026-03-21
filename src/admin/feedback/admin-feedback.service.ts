import { Injectable, NotFoundException } from "@nestjs/common";
import { FeedbackAuthorType, FeedbackStatus } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { AdminReplyDto } from "./dto/admin-reply.dto";
import { FetchAdminFeedbackDto } from "./dto/fetch-admin-feedback.dto";
import { UpdateFeedbackStatusDto } from "./dto/update-status.dto";

@Injectable()
export class AdminFeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async getThreads(dto: FetchAdminFeedbackDto) {
    const { page = 1, limit = 20, type, status, userId } = dto;
    const skip = (page - 1) * limit;

    const where = {
      ...(type && { type }),
      ...(status && { status }),
      ...(userId && { userId }),
    };

    const [items, total] = await Promise.all([
      this.prisma.feedbackThread.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, username: true, email: true } },
          messages: { orderBy: { createdAt: "asc" }, take: 1 },
        },
      }),
      this.prisma.feedbackThread.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getThread(threadId: string) {
    const thread = await this.prisma.feedbackThread.findUnique({
      where: { id: threadId },
      include: {
        user: { select: { id: true, username: true, email: true } },
        messages: { orderBy: { createdAt: "asc" } },
        lemma: { select: { id: true, baseForm: true, normalized: true } },
        text: { select: { id: true, title: true } },
      },
    });
    if (!thread) throw new NotFoundException("Thread not found");
    return thread;
  }

  async updateStatus(threadId: string, dto: UpdateFeedbackStatusDto) {
    await this.ensureExists(threadId);
    return this.prisma.feedbackThread.update({
      where: { id: threadId },
      data: { status: dto.status },
    });
  }

  async reply(adminId: string, threadId: string, dto: AdminReplyDto) {
    await this.ensureExists(threadId);

    const [message] = await this.prisma.$transaction([
      this.prisma.feedbackMessage.create({
        data: {
          threadId,
          authorType: FeedbackAuthorType.ADMIN,
          authorId: adminId,
          body: dto.body,
        },
      }),
      this.prisma.feedbackThread.update({
        where: { id: threadId },
        data: { status: FeedbackStatus.IN_PROGRESS },
      }),
    ]);

    return message;
  }

  async getStats() {
    const [byStatus, byType, total] = await Promise.all([
      this.prisma.feedbackThread.groupBy({
        by: ["status"],
        _count: true,
      }),
      this.prisma.feedbackThread.groupBy({
        by: ["type"],
        _count: true,
      }),
      this.prisma.feedbackThread.count(),
    ]);

    return { total, byStatus, byType };
  }

  private async ensureExists(threadId: string) {
    const thread = await this.prisma.feedbackThread.findUnique({
      where: { id: threadId },
      select: { id: true },
    });
    if (!thread) throw new NotFoundException("Thread not found");
  }
}
