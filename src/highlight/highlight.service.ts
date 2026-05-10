import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { CreateHighlightDto } from "./dto/create-highlight.dto";
import { UpdateHighlightDto } from "./dto/update-highlight.dto";

@Injectable()
export class HighlightService {
  constructor(private readonly prisma: PrismaService) {}

  async getForPage(userId: string, textId: string, pageNumber: number) {
    return this.prisma.userTextHighlight.findMany({
      where: { userId, textId, pageNumber },
      orderBy: { startOffset: "asc" },
    });
  }

  async create(userId: string, dto: CreateHighlightDto) {
    return this.prisma.userTextHighlight.create({
      data: { userId, ...dto },
    });
  }

  async update(userId: string, id: string, dto: UpdateHighlightDto) {
    await this.assertOwner(userId, id);
    return this.prisma.userTextHighlight.update({
      where: { id },
      data: dto,
    });
  }

  async remove(userId: string, id: string) {
    await this.assertOwner(userId, id);
    await this.prisma.userTextHighlight.delete({ where: { id } });
  }

  private async assertOwner(userId: string, id: string) {
    const highlight = await this.prisma.userTextHighlight.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!highlight) throw new NotFoundException("Highlight not found");
    if (highlight.userId !== userId) throw new ForbiddenException();
  }
}
