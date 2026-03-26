import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";

@Injectable()
export class AdminTagsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllTags() {
    return this.prisma.tag.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { texts: true } } },
    });
  }

  async createTag(name: string) {
    const existing = await this.prisma.tag.findUnique({ where: { name } });
    if (existing) throw new ConflictException(`Tag "${name}" already exists`);
    return this.prisma.tag.create({ data: { name } });
  }

  async renameTag(id: string, name: string) {
    const tag = await this.prisma.tag.findUnique({ where: { id } });
    if (!tag) throw new NotFoundException("Tag not found");
    const existing = await this.prisma.tag.findUnique({ where: { name } });
    if (existing && existing.id !== id) throw new ConflictException(`Tag "${name}" already exists`);
    return this.prisma.tag.update({ where: { id }, data: { name } });
  }

  async deleteTag(id: string) {
    const tag = await this.prisma.tag.findUnique({ where: { id } });
    if (!tag) throw new NotFoundException("Tag not found");
    await this.prisma.tag.delete({ where: { id } });
  }
}
