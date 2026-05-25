import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ErrorCode } from "src/common/errors/error-codes";
import { PrismaService } from "src/prisma.service";
import { CreateNoteDto } from "./dto/create-note.dto";
import { UpdateNoteDto } from "./dto/update-note.dto";

@Injectable()
export class NoteService {
  constructor(private readonly prisma: PrismaService) {}

  async getForPage(userId: string, textId: string, pageNumber: number) {
    return this.prisma.userTextNote.findMany({
      where: { userId, textId, pageNumber },
      orderBy: { createdAt: "asc" },
    });
  }

  async create(userId: string, dto: CreateNoteDto) {
    return this.prisma.userTextNote.create({
      data: { userId, ...dto },
    });
  }

  async update(userId: string, id: string, dto: UpdateNoteDto) {
    await this.assertOwner(userId, id);
    return this.prisma.userTextNote.update({
      where: { id },
      data: { body: dto.body },
    });
  }

  async remove(userId: string, id: string) {
    await this.assertOwner(userId, id);
    await this.prisma.userTextNote.delete({ where: { id } });
  }

  private async assertOwner(userId: string, id: string) {
    const note = await this.prisma.userTextNote.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!note) throw new NotFoundException({ code: ErrorCode.NOTE_NOT_FOUND, message: "Note not found" });
    if (note.userId !== userId) throw new ForbiddenException();
  }
}
