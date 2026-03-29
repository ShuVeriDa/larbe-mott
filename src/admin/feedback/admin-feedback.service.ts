import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  FeedbackAuthorType,
  FeedbackMessageType,
  FeedbackStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { AdminReplyDto } from "./dto/admin-reply.dto";
import { AssignFeedbackDto } from "./dto/assign-feedback.dto";
import {
  AdminFeedbackTab,
  FetchAdminFeedbackDto,
} from "./dto/fetch-admin-feedback.dto";
import { TransferFeedbackDto } from "./dto/transfer-feedback.dto";
import { UpdateFeedbackPriorityDto } from "./dto/update-priority.dto";
import { UpdateFeedbackStatusDto } from "./dto/update-status.dto";

@Injectable()
export class AdminFeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async getThreads(dto: FetchAdminFeedbackDto) {
    const {
      page = 1,
      limit = 20,
      type,
      status,
      priority,
      userId,
      assigneeAdminId,
      tab = AdminFeedbackTab.ALL,
      search,
    } = dto;
    const skip = (page - 1) * limit;

    const where: Prisma.FeedbackThreadWhereInput = {
      ...(type && { type }),
      ...(status && { status }),
      ...(!status && tab === AdminFeedbackTab.OPEN && {
        status: { in: [FeedbackStatus.NEW, FeedbackStatus.IN_PROGRESS, FeedbackStatus.ANSWERED] },
      }),
      ...(!status && tab === AdminFeedbackTab.CLOSED && {
        status: FeedbackStatus.RESOLVED,
      }),
      ...(priority && { priority }),
      ...(userId && { userId }),
      ...(assigneeAdminId && { assigneeAdminId }),
    };

    const normalizedSearch = search?.trim();
    if (normalizedSearch) {
      const ticketNumber = Number(normalizedSearch.replace("#", ""));
      where.AND = [
        {
          OR: [
            { title: { contains: normalizedSearch, mode: "insensitive" } },
            { user: { email: { contains: normalizedSearch, mode: "insensitive" } } },
            { user: { username: { contains: normalizedSearch, mode: "insensitive" } } },
            { user: { name: { contains: normalizedSearch, mode: "insensitive" } } },
            { user: { surname: { contains: normalizedSearch, mode: "insensitive" } } },
            {
              messages: {
                some: { body: { contains: normalizedSearch, mode: "insensitive" } },
              },
            },
            ...(Number.isFinite(ticketNumber) ? [{ ticketNumber }] : []),
          ],
        },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.feedbackThread.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, username: true, name: true, surname: true, email: true },
          },
          assigneeAdmin: {
            select: { id: true, username: true, name: true, surname: true, email: true },
          },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      }),
      this.prisma.feedbackThread.count({ where }),
    ]);

    const threadIds = items.map((item) => item.id);
    const unreadCountsByAdmin = await this.prisma.feedbackMessage.groupBy({
      by: ["threadId"],
      where: {
        threadId: { in: threadIds },
        authorType: FeedbackAuthorType.USER,
        isReadByAdmin: false,
      },
      _count: { id: true },
    });
    const unreadMap = Object.fromEntries(
      unreadCountsByAdmin.map((entry) => [entry.threadId, entry._count.id]),
    );

    const mappedItems = items.map((item) => ({
      ...item,
      latestMessage: item.messages[0] ?? null,
      unreadCountAdmin: unreadMap[item.id] ?? 0,
    }));

    return { items: mappedItems, total, page, limit };
  }

  async getThread(threadId: string) {
    const thread = await this.prisma.feedbackThread.findUnique({
      where: { id: threadId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            surname: true,
            email: true,
            signupAt: true,
          },
        },
        assigneeAdmin: {
          select: { id: true, username: true, name: true, surname: true, email: true },
        },
        assignedByAdmin: {
          select: { id: true, username: true, name: true, surname: true, email: true },
        },
        messages: { orderBy: { createdAt: "asc" } },
        lemma: { select: { id: true, baseForm: true, normalized: true } },
        text: { select: { id: true, title: true } },
      },
    });
    if (!thread) throw new NotFoundException("Thread not found");

    const authorIds = [...new Set(thread.messages.map((message) => message.authorId))];
    const authors = await this.prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, username: true, name: true, surname: true, email: true },
    });
    const authorMap = Object.fromEntries(authors.map((author) => [author.id, author]));
    const otherThreadsCount = await this.prisma.feedbackThread.count({
      where: { userId: thread.userId, NOT: { id: threadId } },
    });

    return {
      ...thread,
      otherThreadsCount,
      messages: thread.messages.map((message) => ({
        ...message,
        author: authorMap[message.authorId] ?? null,
      })),
    };
  }

  async updateStatus(threadId: string, dto: UpdateFeedbackStatusDto) {
    await this.ensureExists(threadId);
    return this.prisma.feedbackThread.update({
      where: { id: threadId },
      data: {
        status: dto.status,
        closedAt: dto.status === FeedbackStatus.RESOLVED ? new Date() : null,
      },
    });
  }

  async updatePriority(threadId: string, dto: UpdateFeedbackPriorityDto) {
    await this.ensureExists(threadId);
    return this.prisma.feedbackThread.update({
      where: { id: threadId },
      data: { priority: dto.priority },
    });
  }

  async updateAssignee(adminId: string, threadId: string, dto: AssignFeedbackDto) {
    await this.ensureExists(threadId);

    if (dto.assigneeAdminId) {
      const targetAdmin = await this.prisma.user.findUnique({
        where: { id: dto.assigneeAdminId },
        select: { id: true },
      });
      if (!targetAdmin) throw new NotFoundException("Assignee admin not found");
    }

    return this.prisma.feedbackThread.update({
      where: { id: threadId },
      data: {
        assigneeAdminId: dto.assigneeAdminId ?? null,
        assignedByAdminId: dto.assigneeAdminId ? adminId : null,
        assignedAt: dto.assigneeAdminId ? new Date() : null,
      },
      include: {
        assigneeAdmin: {
          select: { id: true, username: true, name: true, surname: true, email: true },
        },
      },
    });
  }

  async markAsReadByAdmin(threadId: string) {
    await this.ensureExists(threadId);
    const updated = await this.prisma.feedbackMessage.updateMany({
      where: {
        threadId,
        authorType: FeedbackAuthorType.USER,
        isReadByAdmin: false,
      },
      data: { isReadByAdmin: true },
    });
    return { success: true, marked: updated.count };
  }

  async reply(adminId: string, threadId: string, dto: AdminReplyDto) {
    await this.ensureExists(threadId);

    const message = await this.prisma.$transaction(async (tx) => {
      const createdMessage = await tx.feedbackMessage.create({
        data: {
          threadId,
          authorType: FeedbackAuthorType.ADMIN,
          messageType: dto.isInternal
            ? FeedbackMessageType.INTERNAL_NOTE
            : FeedbackMessageType.PUBLIC_REPLY,
          authorId: adminId,
          body: dto.body,
          isReadByAdmin: true,
        },
      });

      if (!dto.isInternal) {
        await tx.feedbackThread.update({
          where: { id: threadId },
          data: {
            status: FeedbackStatus.ANSWERED,
            closedAt: null,
          },
        });
      }

      return createdMessage;
    });

    return message;
  }

  async transfer(adminId: string, threadId: string, dto: TransferFeedbackDto) {
    await this.ensureExists(threadId);
    if (dto.targetAdminId === adminId) {
      throw new BadRequestException("Cannot transfer thread to yourself");
    }

    const targetAdmin = await this.prisma.user.findUnique({
      where: { id: dto.targetAdminId },
      select: { id: true, name: true, surname: true },
    });
    if (!targetAdmin) throw new NotFoundException("Target admin not found");

    const result = await this.prisma.$transaction(async (tx) => {
      const thread = await tx.feedbackThread.update({
        where: { id: threadId },
        data: {
          assigneeAdminId: dto.targetAdminId,
          assignedByAdminId: adminId,
          assignedAt: new Date(),
          status: FeedbackStatus.IN_PROGRESS,
          closedAt: null,
        },
      });

      const noteText = dto.note?.trim();
      const note = await tx.feedbackMessage.create({
        data: {
          threadId,
          authorType: FeedbackAuthorType.ADMIN,
          messageType: FeedbackMessageType.INTERNAL_NOTE,
          authorId: adminId,
          body: noteText
            ? `Передано коллеге: ${noteText}`
            : "Обращение передано коллеге",
          isReadByAdmin: true,
        },
      });

      return { thread, note };
    });

    return result;
  }

  async getStats() {
    const [byStatus, byType, total, unreadByAdmin] = await Promise.all([
      this.prisma.feedbackThread.groupBy({
        by: ["status"],
        _count: true,
      }),
      this.prisma.feedbackThread.groupBy({
        by: ["type"],
        _count: true,
      }),
      this.prisma.feedbackThread.count(),
      this.prisma.feedbackMessage.count({
        where: {
          authorType: FeedbackAuthorType.USER,
          isReadByAdmin: false,
        },
      }),
    ]);

    const openTotal = byStatus.reduce((acc, item) => {
      if (
        item.status === FeedbackStatus.NEW ||
        item.status === FeedbackStatus.IN_PROGRESS ||
        item.status === FeedbackStatus.ANSWERED
      ) {
        return acc + item._count;
      }
      return acc;
    }, 0);

    return { total, byStatus, byType, openTotal, unreadByAdmin };
  }

  private async ensureExists(threadId: string) {
    const thread = await this.prisma.feedbackThread.findUnique({
      where: { id: threadId },
      select: { id: true },
    });
    if (!thread) throw new NotFoundException("Thread not found");
  }
}
