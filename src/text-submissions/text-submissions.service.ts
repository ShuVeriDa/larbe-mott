import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  Language,
  NotificationType,
  Prisma,
  ProcessingTrigger,
  RoleName,
  SubmissionLicenseType,
  SubmissionType,
  TextSubmissionStatus,
} from "@prisma/client";
import { extractTextFromTiptap } from "src/common/utils/extractTextFromTiptap";
import { ErrorCode } from "src/common/errors/error-codes";
import { NOTIFICATION_EVENTS } from "src/notification/notification-events";
import { TokenizerProcessor } from "src/markup-engine/tokenizer/tokenizer.processor";
import { PrismaService } from "src/prisma.service";
import { CreateTextSubmissionDto } from "./dto/create-text-submission.dto";
import { UpdateTextSubmissionDto } from "./dto/update-text-submission.dto";
import { ReviewTextSubmissionDto } from "./dto/review-text-submission.dto";

const VALID_STATUSES = new Set(Object.values(TextSubmissionStatus));

// States the owner can edit/delete
const EDITABLE_STATUSES: TextSubmissionStatus[] = [
  TextSubmissionStatus.DRAFT,
  TextSubmissionStatus.REJECTED,
];

// States the owner can submit for moderation
const SUBMITTABLE_STATUSES: TextSubmissionStatus[] = [
  TextSubmissionStatus.DRAFT,
  TextSubmissionStatus.REJECTED,
];

const userSelect = { select: { id: true, username: true, name: true } } as const;

// List select — excludes content/contentRich/pages to keep payloads small
const LIST_SELECT = {
  id: true,
  userId: true,
  title: true,
  language: true,
  author: true,
  submissionType: true,
  licenseType: true,
  publicationYear: true,
  status: true,
  reviewComment: true,
  reviewedAt: true,
  textId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const PAGES_SELECT = {
  id: true,
  pageNumber: true,
  title: true,
  contentRich: true,
} as const;

@Injectable()
export class TextSubmissionsService {
  private readonly logger = new Logger(TextSubmissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenizerProcessor: TokenizerProcessor,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── CREATE ────────────────────────────────────────────────────────────────

  async create(userId: string, dto: CreateTextSubmissionDto) {
    const hasPages = dto.pages && dto.pages.length > 0;

    if (!hasPages && !dto.sourceUrl && !dto.content && !dto.contentRich) {
      throw new BadRequestException({
        code: ErrorCode.TEXT_SUBMISSION_SOURCE_REQUIRED,
        message: "Provide pages, a source URL, plain content, or rich content",
      });
    }

    const author = await this.resolveAuthor(userId, dto.submissionType, dto.author);

    const result = await this.prisma.$transaction(async (tx) => {
      const submission = await tx.textSubmission.create({
        data: {
          userId,
          title: dto.title,
          language: dto.language,
          author,
          sourceUrl: dto.sourceUrl ?? null,
          content: dto.content ?? null,
          comment: dto.comment ?? null,
          submissionType: dto.submissionType ?? SubmissionType.EXTERNAL,
          licenseType: dto.licenseType ?? null,
          publicationYear: dto.publicationYear ?? null,
          contentRich: !hasPages && dto.contentRich !== undefined
            ? (dto.contentRich as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          status: dto.status ?? TextSubmissionStatus.DRAFT,
        },
      });

      if (hasPages) {
        await tx.textSubmissionPage.createMany({
          data: dto.pages!.map((p) => ({
            submissionId: submission.id,
            pageNumber: p.pageNumber,
            title: p.title ?? null,
            contentRich: p.contentRich as Prisma.InputJsonValue,
          })),
        });
      }

      return tx.textSubmission.findUniqueOrThrow({
        where: { id: submission.id },
        include: { pages: { select: PAGES_SELECT, orderBy: { pageNumber: "asc" } } },
      });
    });

    // Fire-and-forget: notify admins after successful DB write
    this.notifyAdmins(NotificationType.NEW_TEXT_SUBMISSION, result.id).catch((err) =>
      this.logger.error("Failed to notify admins about new text submission", err),
    );

    return result;
  }

  // ─── OWNER: LIST ───────────────────────────────────────────────────────────

  async getMySubmissions(
    userId: string,
    params: { status?: TextSubmissionStatus; limit?: number; offset?: number },
  ) {
    const { status, limit = 20, offset = 0 } = params;
    const take = Math.min(limit, 100);

    const where: Prisma.TextSubmissionWhereInput = {
      userId,
      ...(status ? { status } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.textSubmission.findMany({
        where,
        select: { ...LIST_SELECT, reviewer: userSelect },
        orderBy: { updatedAt: "desc" },
        take,
        skip: offset,
      }),
      this.prisma.textSubmission.count({ where }),
    ]);

    return { data, meta: { total, limit: take, offset } };
  }

  // ─── OWNER: GET ONE DRAFT ──────────────────────────────────────────────────

  async findOneOwned(userId: string, id: string) {
    const submission = await this.prisma.textSubmission.findUnique({
      where: { id },
      include: {
        user: userSelect,
        reviewer: userSelect,
        pages: { select: PAGES_SELECT, orderBy: { pageNumber: "asc" } },
      },
    });

    // Return the same 404 whether "not found" or "belongs to another user" — no info leak
    if (!submission || submission.userId !== userId) {
      throw new NotFoundException({
        code: ErrorCode.TEXT_SUBMISSION_NOT_FOUND,
        message: "Text submission not found",
      });
    }

    return submission;
  }

  // ─── OWNER: UPDATE (DRAFT / REJECTED only) ─────────────────────────────────

  async update(userId: string, id: string, dto: UpdateTextSubmissionDto) {
    const submission = await this.prisma.textSubmission.findUnique({ where: { id } });

    if (!submission || submission.userId !== userId) {
      throw new NotFoundException({
        code: ErrorCode.TEXT_SUBMISSION_NOT_FOUND,
        message: "Text submission not found",
      });
    }

    if (!EDITABLE_STATUSES.includes(submission.status)) {
      throw new ForbiddenException({
        code: ErrorCode.TEXT_SUBMISSION_NOT_EDITABLE,
        message: "Only DRAFT or REJECTED submissions can be edited",
      });
    }

    const author =
      dto.submissionType !== undefined
        ? await this.resolveAuthor(userId, dto.submissionType, dto.author)
        : dto.author;

    const hasPages = dto.pages && dto.pages.length > 0;

    return this.prisma.$transaction(async (tx) => {
      if (hasPages) {
        // Replace-all strategy: delete existing pages, insert new ones
        await tx.textSubmissionPage.deleteMany({ where: { submissionId: id } });
        await tx.textSubmissionPage.createMany({
          data: dto.pages!.map((p) => ({
            submissionId: id,
            pageNumber: p.pageNumber,
            title: p.title ?? null,
            contentRich: p.contentRich as Prisma.InputJsonValue,
          })),
        });
      }

      const updated = await tx.textSubmission.update({
        where: { id },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.language !== undefined && { language: dto.language }),
          ...(dto.submissionType !== undefined && { submissionType: dto.submissionType }),
          ...(dto.licenseType !== undefined && { licenseType: dto.licenseType }),
          ...(dto.publicationYear !== undefined && { publicationYear: dto.publicationYear }),
          ...(author !== undefined && { author }),
          ...(dto.sourceUrl !== undefined && { sourceUrl: dto.sourceUrl || null }),
          ...(dto.content !== undefined && { content: dto.content }),
          // When pages are sent, clear the legacy single contentRich field
          ...(!hasPages && dto.contentRich !== undefined && {
            contentRich: dto.contentRich as Prisma.InputJsonValue,
          }),
          ...(hasPages && { contentRich: Prisma.JsonNull }),
          ...(dto.comment !== undefined && { comment: dto.comment }),
        },
        include: {
          pages: { select: PAGES_SELECT, orderBy: { pageNumber: "asc" } },
        },
      });

      return updated;
    });
  }

  // ─── OWNER: DELETE (DRAFT / REJECTED only) ─────────────────────────────────

  async remove(userId: string, id: string) {
    const submission = await this.prisma.textSubmission.findUnique({ where: { id } });

    if (!submission || submission.userId !== userId) {
      throw new NotFoundException({
        code: ErrorCode.TEXT_SUBMISSION_NOT_FOUND,
        message: "Text submission not found",
      });
    }

    if (!EDITABLE_STATUSES.includes(submission.status)) {
      throw new ForbiddenException({
        code: ErrorCode.TEXT_SUBMISSION_NOT_EDITABLE,
        message: "Only DRAFT or REJECTED submissions can be deleted",
      });
    }

    await this.prisma.textSubmission.delete({ where: { id } });
  }

  // ─── OWNER: SUBMIT (DRAFT/REJECTED → PENDING) ──────────────────────────────

  async submit(userId: string, id: string) {
    const submission = await this.prisma.textSubmission.findUnique({
      where: { id },
      include: { pages: { select: { id: true } } },
    });

    if (!submission || submission.userId !== userId) {
      throw new NotFoundException({
        code: ErrorCode.TEXT_SUBMISSION_NOT_FOUND,
        message: "Text submission not found",
      });
    }

    if (!SUBMITTABLE_STATUSES.includes(submission.status)) {
      throw new ForbiddenException({
        code: ErrorCode.TEXT_SUBMISSION_NOT_EDITABLE,
        message: "Only DRAFT or REJECTED submissions can be submitted",
      });
    }

    const hasPages = submission.pages.length > 0;

    // Validate: must have content in some form
    if (!hasPages && !submission.sourceUrl && !submission.content && !submission.contentRich) {
      throw new BadRequestException({
        code: ErrorCode.TEXT_SUBMISSION_SOURCE_REQUIRED,
        message: "Provide pages, a source URL, plain content, or rich content before submitting",
      });
    }

    // EXTERNAL submissions must have a licenseType
    if (
      submission.submissionType === SubmissionType.EXTERNAL &&
      !submission.licenseType
    ) {
      throw new BadRequestException({
        code: ErrorCode.TEXT_SUBMISSION_INVALID_STATUS,
        message: "External submissions must specify a licenseType before submitting",
      });
    }

    // Re-derive author for ORIGINAL on resubmit (user may have updated profile)
    const author =
      submission.submissionType === SubmissionType.ORIGINAL
        ? await this.resolveAuthor(userId, submission.submissionType, undefined)
        : submission.author;

    // Atomic update: transition to PENDING + clear review fields in one call (M1)
    return this.prisma.textSubmission.update({
      where: { id },
      data: {
        status: TextSubmissionStatus.PENDING,
        author: author ?? submission.author,
        // Clear stale review fields on resubmit (REJECTED → PENDING)
        reviewComment: null,
        reviewedBy: null,
        reviewedAt: null,
      },
    });
  }

  // ─── ADMIN: STATS ──────────────────────────────────────────────────────────

  async stats() {
    const rows = await this.prisma.textSubmission.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    const counts = Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
    const pending = counts[TextSubmissionStatus.PENDING] ?? 0;
    const approved = counts[TextSubmissionStatus.APPROVED] ?? 0;
    const rejected = counts[TextSubmissionStatus.REJECTED] ?? 0;
    const draft = counts[TextSubmissionStatus.DRAFT] ?? 0;
    return { total: pending + approved + rejected + draft, pending, approved, rejected, draft };
  }

  // ─── ADMIN: LIST ───────────────────────────────────────────────────────────

  async list(
    status?: TextSubmissionStatus,
    limit = 50,
    offset = 0,
    order: "asc" | "desc" = "desc",
    q?: string,
  ) {
    const where: Prisma.TextSubmissionWhereInput = {
      ...(status && { status }),
      ...(q && {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { user: { username: { contains: q, mode: "insensitive" } } },
          { user: { name: { contains: q, mode: "insensitive" } } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.textSubmission.findMany({
        where,
        include: {
          user: userSelect,
          reviewer: userSelect,
        },
        orderBy: { createdAt: order },
        take: limit,
        skip: offset,
      }),
      this.prisma.textSubmission.count({ where }),
    ]);

    return { data, meta: { total, limit, offset } };
  }

  // ─── ADMIN: GET ONE ────────────────────────────────────────────────────────

  async findOne(id: string) {
    const submission = await this.prisma.textSubmission.findUnique({
      where: { id },
      include: {
        user: userSelect,
        reviewer: userSelect,
        pages: { select: PAGES_SELECT, orderBy: { pageNumber: "asc" } },
      },
    });
    if (!submission) {
      throw new NotFoundException({
        code: ErrorCode.TEXT_SUBMISSION_NOT_FOUND,
        message: `TextSubmission #${id} not found`,
      });
    }
    return submission;
  }

  // ─── ADMIN: REVIEW (approve / reject) ─────────────────────────────────────

  async review(id: string, reviewerId: string, dto: ReviewTextSubmissionDto) {
    const submission = await this.prisma.textSubmission.findUnique({
      where: { id },
      include: { pages: { select: PAGES_SELECT, orderBy: { pageNumber: "asc" } } },
    });
    if (!submission) {
      throw new NotFoundException({
        code: ErrorCode.TEXT_SUBMISSION_NOT_FOUND,
        message: `TextSubmission #${id} not found`,
      });
    }
    if (submission.status !== TextSubmissionStatus.PENDING) {
      throw new BadRequestException({
        code: ErrorCode.TEXT_SUBMISSION_ALREADY_REVIEWED,
        message: "Submission has already been reviewed",
      });
    }

    if (dto.decision === "approve") {
      return this.approveSubmission(submission, reviewerId, dto.reviewComment);
    }

    const rejected = await this.prisma.textSubmission.update({
      where: { id },
      data: {
        status: TextSubmissionStatus.REJECTED,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        reviewComment: dto.reviewComment,
      },
    });

    // Emit after DB write — notify the submission author
    this.eventEmitter.emit(NOTIFICATION_EVENTS.CREATE, {
      userId: submission.userId,
      type: NotificationType.TEXT_SUBMISSION_REJECTED,
      entityId: id,
    });

    return rejected;
  }

  private async approveSubmission(
    submission: {
      id: string;
      userId: string;
      title: string;
      language: string;
      author: string | null;
      sourceUrl: string | null;
      contentRich: Prisma.JsonValue | null;
      pages: { id: string; pageNumber: number; title: string | null; contentRich: Prisma.JsonValue }[];
    },
    reviewerId: string,
    reviewComment?: string,
  ) {
    const language = Object.values(Language).includes(submission.language as Language)
      ? (submission.language as Language)
      : Language.CHE;

    const text = await this.prisma.$transaction(async (tx) => {
      const created = await tx.text.create({
        data: {
          title: submission.title,
          language,
          author: submission.author ?? null,
          source: submission.sourceUrl ?? null,
          createdById: reviewerId,
          submittedById: submission.userId,
        },
      });

      const hasPages = submission.pages.length > 0;

      if (hasPages) {
        for (const page of submission.pages) {
          const contentRaw = extractTextFromTiptap(page.contentRich);
          await tx.textPage.create({
            data: {
              textId: created.id,
              pageNumber: page.pageNumber,
              title: page.title ?? null,
              contentRich: page.contentRich as Prisma.InputJsonValue,
              contentRaw,
            },
          });
        }
      } else if (submission.contentRich) {
        const contentRaw = extractTextFromTiptap(submission.contentRich);
        await tx.textPage.create({
          data: {
            textId: created.id,
            pageNumber: 1,
            contentRich: submission.contentRich as Prisma.InputJsonValue,
            contentRaw,
          },
        });
      }

      await tx.textSubmission.update({
        where: { id: submission.id },
        data: {
          status: TextSubmissionStatus.APPROVED,
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          reviewComment: reviewComment,
          textId: created.id,
        },
      });

      return created;
    });

    void this.tokenizerProcessor
      .processText(text.id, {
        trigger: ProcessingTrigger.AUTO_ON_CREATE,
        initiatorId: reviewerId,
        useNormalization: true,
        useMorphAnalysis: false,
        label: "авто-токенизация из сабмишна",
      })
      .catch(() => undefined);

    // Emit after commit — notify the submission author
    this.eventEmitter.emit(NOTIFICATION_EVENTS.CREATE, {
      userId: submission.userId,
      type: NotificationType.TEXT_SUBMISSION_APPROVED,
      entityId: submission.id,
    });

    return this.prisma.textSubmission.findUniqueOrThrow({
      where: { id: submission.id },
      include: {
        user: userSelect,
        reviewer: userSelect,
        pages: { select: PAGES_SELECT, orderBy: { pageNumber: "asc" } },
      },
    });
  }

  // ─── HELPERS ───────────────────────────────────────────────────────────────

  parseStatus(raw?: string): TextSubmissionStatus | undefined {
    if (!raw) return undefined;
    if (!VALID_STATUSES.has(raw as TextSubmissionStatus)) {
      throw new BadRequestException({
        code: ErrorCode.TEXT_SUBMISSION_INVALID_STATUS,
        message: `Invalid status: ${raw}`,
      });
    }
    return raw as TextSubmissionStatus;
  }

  // DECISION C3: for ORIGINAL submissions, derive author from user's profile.
  // Ignores client-sent author value.
  private async resolveAuthor(
    userId: string,
    submissionType?: SubmissionType,
    clientAuthor?: string,
  ): Promise<string | null> {
    if (submissionType !== SubmissionType.ORIGINAL) {
      return clientAuthor ?? null;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, surname: true },
    });

    if (!user) return null;
    const parts = [user.name, user.surname].filter(Boolean);
    return parts.join(" ").trim() || null;
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
