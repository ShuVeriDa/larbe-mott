import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, TextSubmissionStatus } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { ErrorCode } from "src/common/errors/error-codes";
import { CreateTextSubmissionDto } from "./dto/create-text-submission.dto";
import { ReviewTextSubmissionDto } from "./dto/review-text-submission.dto";

const VALID_STATUSES = new Set(Object.values(TextSubmissionStatus));

const userSelect = { select: { id: true, username: true, name: true } } as const;

@Injectable()
export class TextSubmissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateTextSubmissionDto) {
    if (!dto.sourceUrl && !dto.content) {
      throw new BadRequestException({
        code: ErrorCode.TEXT_SUBMISSION_SOURCE_REQUIRED,
        message: "Provide either a source URL or paste the text content",
      });
    }

    return this.prisma.textSubmission.create({
      data: {
        userId,
        title: dto.title,
        language: dto.language,
        author: dto.author,
        sourceUrl: dto.sourceUrl,
        content: dto.content,
        comment: dto.comment,
      },
    });
  }

  async getMySubmissions(userId: string, limit = 20, offset = 0) {
    const where: Prisma.TextSubmissionWhereInput = { userId };
    const [data, total] = await Promise.all([
      this.prisma.textSubmission.findMany({
        where,
        include: { reviewer: userSelect },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.textSubmission.count({ where }),
    ]);
    return { data, meta: { total, limit, offset } };
  }

  async stats() {
    const rows = await this.prisma.textSubmission.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    const counts = Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
    const pending = counts[TextSubmissionStatus.PENDING] ?? 0;
    const approved = counts[TextSubmissionStatus.APPROVED] ?? 0;
    const rejected = counts[TextSubmissionStatus.REJECTED] ?? 0;
    return { total: pending + approved + rejected, pending, approved, rejected };
  }

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

  async findOne(id: string) {
    const submission = await this.prisma.textSubmission.findUnique({
      where: { id },
      include: {
        user: userSelect,
        reviewer: userSelect,
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

  async review(id: string, reviewerId: string, dto: ReviewTextSubmissionDto) {
    const submission = await this.prisma.textSubmission.findUnique({ where: { id } });
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

    const newStatus =
      dto.decision === "approve"
        ? TextSubmissionStatus.APPROVED
        : TextSubmissionStatus.REJECTED;

    return this.prisma.textSubmission.update({
      where: { id },
      data: {
        status: newStatus,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        reviewComment: dto.reviewComment,
      },
    });
  }

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
}
