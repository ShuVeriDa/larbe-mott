import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  FeedbackAuthorType,
  FeedbackMessageType,
  FeedbackStatus,
  NotificationType,
  Prisma,
  RoleName,
  SubscriptionStatus,
} from "@prisma/client";
import { ErrorCode } from "src/common/errors/error-codes";
import { NOTIFICATION_EVENTS } from "src/notification/notification-events";
import { PrismaService } from "src/prisma.service";
import { AdminReplyDto } from "./dto/admin-reply.dto";
import { AssignFeedbackDto } from "./dto/assign-feedback.dto";
import {
  ExportAdminFeedbackDto,
  FeedbackExportFormat,
} from "./dto/export-feedback.dto";
import {
  AdminFeedbackTab,
  FetchAdminFeedbackDto,
} from "./dto/fetch-admin-feedback.dto";
import { TransferFeedbackDto } from "./dto/transfer-feedback.dto";
import { UpdateFeedbackPriorityDto } from "./dto/update-priority.dto";
import { UpdateFeedbackStatusDto } from "./dto/update-status.dto";

const ASSIGNEE_ROLES: RoleName[] = [
  RoleName.SUPPORT,
  RoleName.ADMIN,
  RoleName.SUPERADMIN,
];

const ACTIVE_SUB_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
];

@Injectable()
export class AdminFeedbackService {
  private readonly logger = new Logger(AdminFeedbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

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
            select: {
              id: true,
              username: true,
              name: true,
              surname: true,
              email: true,
              subscriptions: {
                where: { status: { in: ACTIVE_SUB_STATUSES } },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: {
                  status: true,
                  endDate: true,
                  isLifetime: true,
                  plan: { select: { name: true, type: true } },
                },
              },
            },
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

    const mappedItems = items.map((item) => {
      const { subscriptions, ...userRest } = item.user;
      return {
        ...item,
        user: { ...userRest, activeSubscription: subscriptions[0] ?? null },
        latestMessage: item.messages[0] ?? null,
        unreadCountAdmin: unreadMap[item.id] ?? 0,
      };
    });

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
            subscriptions: {
              where: { status: { in: ACTIVE_SUB_STATUSES } },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                status: true,
                endDate: true,
                isLifetime: true,
                plan: { select: { name: true, type: true } },
              },
            },
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
    if (!thread) throw new NotFoundException({ code: ErrorCode.THREAD_NOT_FOUND, message: "Thread not found" });

    const authorIds = [...new Set(thread.messages.map((message) => message.authorId))];
    const authors = await this.prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, username: true, name: true, surname: true, email: true },
    });
    const authorMap = Object.fromEntries(authors.map((author) => [author.id, author]));
    const otherThreadsCount = await this.prisma.feedbackThread.count({
      where: { userId: thread.userId, NOT: { id: threadId } },
    });

    const { subscriptions: userSubs, ...userRest } = thread.user;

    return {
      ...thread,
      user: { ...userRest, activeSubscription: userSubs[0] ?? null },
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
      if (!targetAdmin) throw new NotFoundException({ code: ErrorCode.USER_NOT_FOUND, message: "Assignee admin not found" });
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
    const thread = await this.prisma.feedbackThread.findUnique({
      where: { id: threadId },
      select: { id: true, userId: true },
    });
    if (!thread) throw new NotFoundException({ code: ErrorCode.THREAD_NOT_FOUND, message: "Thread not found" });

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

    // Emit after commit — only for public replies visible to the user
    if (!dto.isInternal) {
      this.eventEmitter.emit(NOTIFICATION_EVENTS.CREATE, {
        userId: thread.userId,
        type: NotificationType.FEEDBACK_REPLY,
        entityId: threadId,
      });
    }

    return message;
  }

  async transfer(adminId: string, threadId: string, dto: TransferFeedbackDto) {
    await this.ensureExists(threadId);
    if (dto.targetAdminId === adminId) {
      throw new BadRequestException({ code: ErrorCode.FEEDBACK_CANNOT_TRANSFER_TO_SELF, message: "Cannot transfer thread to yourself" });
    }

    const targetAdmin = await this.prisma.user.findUnique({
      where: { id: dto.targetAdminId },
      select: { id: true, name: true, surname: true },
    });
    if (!targetAdmin) throw new NotFoundException({ code: ErrorCode.USER_NOT_FOUND, message: "Target admin not found" });

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

  async deleteThread(threadId: string) {
    await this.ensureExists(threadId);
    await this.prisma.feedbackThread.delete({ where: { id: threadId } });
    return { success: true };
  }

  async getAssignees() {
    const admins = await this.prisma.user.findMany({
      where: {
        roles: { some: { role: { name: { in: ASSIGNEE_ROLES } } } },
      },
      select: {
        id: true,
        username: true,
        name: true,
        surname: true,
        email: true,
        roles: {
          select: { role: { select: { name: true } } },
        },
      },
      orderBy: [{ name: "asc" }, { username: "asc" }],
    });

    return admins.map((admin) => ({
      id: admin.id,
      username: admin.username,
      name: admin.name,
      surname: admin.surname,
      email: admin.email,
      roles: admin.roles.map((r) => r.role.name),
    }));
  }

  async exportThreads(dto: ExportAdminFeedbackDto) {
    const { format = FeedbackExportFormat.JSON, ...filters } = dto;

    const result = await this.getThreads({ ...filters, page: 1, limit: 10_000 });
    const items = result.items;

    if (format === FeedbackExportFormat.CSV) {
      const headers = [
        "ticketNumber",
        "createdAt",
        "updatedAt",
        "type",
        "status",
        "priority",
        "userEmail",
        "userName",
        "plan",
        "assignee",
        "title",
        "latestMessage",
      ];
      const escape = (v: unknown) =>
        `"${String(v ?? "").replace(/"/g, '""')}"`;
      const rows = items.map((item) => {
        const userName = [item.user.name, item.user.surname]
          .filter(Boolean)
          .join(" ")
          .trim();
        const assignee = item.assigneeAdmin
          ? [item.assigneeAdmin.name, item.assigneeAdmin.surname]
              .filter(Boolean)
              .join(" ")
              .trim() || item.assigneeAdmin.username
          : "";
        return [
          item.ticketNumber,
          item.createdAt.toISOString(),
          item.updatedAt.toISOString(),
          item.type,
          item.status,
          item.priority,
          item.user.email ?? "",
          userName || item.user.username || "",
          item.user.activeSubscription?.plan.type ?? "FREE",
          assignee,
          item.title ?? "",
          item.latestMessage?.body ?? "",
        ]
          .map(escape)
          .join(",");
      });
      const csv = [headers.join(","), ...rows].join("\n");
      return { format: FeedbackExportFormat.CSV as const, data: csv };
    }

    return { format: FeedbackExportFormat.JSON as const, data: items };
  }

  private async ensureExists(threadId: string) {
    const thread = await this.prisma.feedbackThread.findUnique({
      where: { id: threadId },
      select: { id: true },
    });
    if (!thread) throw new NotFoundException({ code: ErrorCode.THREAD_NOT_FOUND, message: "Thread not found" });
  }

  private async notifyAdmins(type: NotificationType, entityId: string): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: { roles: { some: { role: { name: { in: [RoleName.ADMIN, RoleName.SUPERADMIN, RoleName.SUPPORT] } } } } },
      select: { id: true },
    });
    for (const admin of admins) {
      this.eventEmitter.emit(NOTIFICATION_EVENTS.CREATE, {
        userId: admin.id,
        type,
        entityId,
      });
    }
  }
}
