import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { FeedbackAuthorType } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { AddMessageDto } from "./dto/add-message.dto";
import { CreateFeedbackDto } from "./dto/create-feedback.dto";
import { CreateReactionDto } from "./dto/create-reaction.dto";
import { GetFeedbackDto } from "./dto/get-feedback.dto";

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async createThread(userId: string, dto: CreateFeedbackDto) {
    return this.prisma.feedbackThread.create({
      data: {
        userId,
        type: dto.type,
        contextType: dto.contextType,
        contextWord: dto.contextWord,
        contextSentence: dto.contextSentence,
        contextLemmaId: dto.contextLemmaId,
        contextTextId: dto.contextTextId,
        contextPosition: dto.contextPosition,
        contextAction: dto.contextAction,
        messages: {
          create: {
            authorType: FeedbackAuthorType.USER,
            authorId: userId,
            body: dto.body,
          },
        },
      },
      include: { messages: true },
    });
  }

  async getThreads(userId: string, dto: GetFeedbackDto) {
    const { page = 1, limit = 20, type, status } = dto;
    const skip = (page - 1) * limit;

    const where = {
      userId,
      ...(type && { type }),
      ...(status && { status }),
    };

    const [items, total] = await Promise.all([
      this.prisma.feedbackThread.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          messages: { orderBy: { createdAt: "asc" }, take: 1 },
        },
      }),
      this.prisma.feedbackThread.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getThread(userId: string, threadId: string) {
    const thread = await this.prisma.feedbackThread.findFirst({
      where: { id: threadId, userId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!thread) throw new NotFoundException("Thread not found");

    const authorIds = [...new Set(thread.messages.map((m) => m.authorId))];
    const authors = await this.prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, name: true, surname: true },
    });
    const authorMap = Object.fromEntries(authors.map((a) => [a.id, a]));

    return {
      ...thread,
      messages: thread.messages.map((m) => ({
        ...m,
        author: authorMap[m.authorId] ?? null,
      })),
    };
  }

  async addMessage(userId: string, threadId: string, dto: AddMessageDto) {
    const thread = await this.prisma.feedbackThread.findFirst({
      where: { id: threadId, userId },
    });
    if (!thread) throw new NotFoundException("Thread not found");

    return this.prisma.feedbackMessage.create({
      data: {
        threadId,
        authorType: FeedbackAuthorType.USER,
        authorId: userId,
        body: dto.body,
      },
    });
  }

  async createReaction(userId: string, dto: CreateReactionDto) {
    if (!dto.lemmaId && !dto.textId) {
      throw new BadRequestException("Provide lemmaId or textId");
    }

    // Toggle: delete if same reaction already exists
    const existing = await this.prisma.feedbackReaction.findFirst({
      where: {
        userId,
        type: dto.type,
        lemmaId: dto.lemmaId ?? null,
        textId: dto.textId ?? null,
      },
    });

    if (existing) {
      await this.prisma.feedbackReaction.delete({ where: { id: existing.id } });
      return { toggled: false };
    }

    const reaction = await this.prisma.feedbackReaction.create({
      data: {
        userId,
        type: dto.type,
        lemmaId: dto.lemmaId,
        textId: dto.textId,
      },
    });

    return { toggled: true, reaction };
  }

  async deleteReaction(userId: string, reactionId: string) {
    const reaction = await this.prisma.feedbackReaction.findFirst({
      where: { id: reactionId, userId },
    });
    if (!reaction) throw new NotFoundException("Reaction not found");
    await this.prisma.feedbackReaction.delete({ where: { id: reactionId } });
  }
}
