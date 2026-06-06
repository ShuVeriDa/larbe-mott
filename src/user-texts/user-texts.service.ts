import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserTextType } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { ErrorCode } from "src/common/errors/error-codes";
import { UserTextTokenizerProcessor } from "src/user-text-reader/user-text-tokenizer.processor";
import { CreateUserTextDto } from "./dto/create-user-text.dto";
import { UpdateUserTextDto } from "./dto/update-user-text.dto";

// Fields returned in list responses — content (TipTap JSON) is excluded to keep payloads small.
const LIST_SELECT = {
  id: true,
  userId: true,
  title: true,
  language: true,
  author: true,
  sourceUrl: true,
  type: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UserTextsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenizerProcessor: UserTextTokenizerProcessor,
  ) {}

  async create(userId: string, dto: CreateUserTextDto) {
    const author = await this.resolveAuthor(userId, dto.type, dto.author);

    const userText = await this.prisma.userText.create({
      data: {
        userId,
        title: dto.title,
        language: dto.language,
        type: dto.type,
        author,
        sourceUrl: dto.sourceUrl ?? null,
        content: dto.content as Prisma.InputJsonValue,
      },
    });

    // Fire-and-forget tokenization so words are ready when user opens the reader
    void this.tokenizerProcessor.processUserText(userText.id, userId).catch(() => {});

    return userText;
  }

  async findMine(
    userId: string,
    params: { type?: UserTextType; limit?: number; offset?: number },
  ) {
    const { type, limit = 20, offset = 0 } = params;
    const take = Math.min(limit, 100);

    const where = { userId, ...(type ? { type } : {}) };

    const [data, total] = await Promise.all([
      this.prisma.userText.findMany({
        where,
        select: LIST_SELECT,
        orderBy: { updatedAt: "desc" },
        take,
        skip: offset,
      }),
      this.prisma.userText.count({ where }),
    ]);

    return { data, meta: { total, limit: take, offset } };
  }

  async findOneOwned(userId: string, id: string) {
    // Atomic owner-scoped query — returns 404 for both "not found" and "not yours"
    const userText = await this.prisma.userText.findUnique({
      where: { id },
    });

    if (!userText || userText.userId !== userId) {
      throw new NotFoundException({
        code: ErrorCode.USER_TEXT_NOT_FOUND,
        message: "User text not found",
      });
    }

    return userText;
  }

  async update(userId: string, id: string, dto: UpdateUserTextDto) {
    await this.findOneOwned(userId, id);

    const author =
      dto.type !== undefined
        ? await this.resolveAuthor(userId, dto.type, dto.author)
        : dto.author;

    const updated = await this.prisma.userText.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.language !== undefined && { language: dto.language }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(author !== undefined && { author }),
        ...(dto.sourceUrl !== undefined && { sourceUrl: dto.sourceUrl || null }),
        ...(dto.content !== undefined && { content: dto.content as Prisma.InputJsonValue }),
      },
    });

    // Re-tokenize when content changes — invalidate existing version first so
    // processUserText creates a fresh one (idempotency guard checks isCurrent=true+COMPLETED)
    if (dto.content !== undefined) {
      void this.prisma.userTextProcessingVersion
        .updateMany({ where: { userTextId: id }, data: { isCurrent: false } })
        .then(() => this.tokenizerProcessor.processUserText(id, userId))
        .catch(() => {});
    }

    return updated;
  }

  async remove(userId: string, id: string) {
    await this.findOneOwned(userId, id);
    await this.prisma.userText.delete({ where: { id } });
  }

  // DECISION C3: for ORIGINAL type derive author from user name server-side,
  // ignoring any client-sent author value.
  private async resolveAuthor(
    userId: string,
    type: UserTextType,
    clientAuthor?: string,
  ): Promise<string | null> {
    if (type !== UserTextType.ORIGINAL) {
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
}
