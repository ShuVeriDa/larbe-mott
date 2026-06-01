import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ErrorCode } from "src/common/errors/error-codes";
import { PrismaService } from "src/prisma.service";
import type { CreateGenreDto, UpdateGenreDto } from "./dto/genre.dto";

@Injectable()
export class AdminGenresService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllGenres() {
    return this.prisma.genre.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { texts: true } } },
    });
  }

  async createGenre(dto: CreateGenreDto) {
    await this.assertNameUnique(dto.name);
    await this.assertSlugUnique(dto.slug);
    return this.prisma.genre.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateGenre(id: string, dto: UpdateGenreDto) {
    const genre = await this.prisma.genre.findUnique({ where: { id } });
    if (!genre) throw new NotFoundException({ code: ErrorCode.GENRE_NOT_FOUND, message: "Genre not found" });
    if (dto.name && dto.name !== genre.name) await this.assertNameUnique(dto.name);
    if (dto.slug && dto.slug !== genre.slug) await this.assertSlugUnique(dto.slug);
    return this.prisma.genre.update({ where: { id }, data: dto });
  }

  async deleteGenre(id: string) {
    const genre = await this.prisma.genre.findUnique({ where: { id } });
    if (!genre) throw new NotFoundException({ code: ErrorCode.GENRE_NOT_FOUND, message: "Genre not found" });
    await this.prisma.genre.delete({ where: { id } });
  }

  private async assertNameUnique(name: string) {
    const existing = await this.prisma.genre.findUnique({ where: { name } });
    if (existing) throw new ConflictException({ code: ErrorCode.GENRE_ALREADY_EXISTS, message: `Genre "${name}" already exists` });
  }

  private async assertSlugUnique(slug: string) {
    const existing = await this.prisma.genre.findUnique({ where: { slug } });
    if (existing) throw new ConflictException({ code: ErrorCode.GENRE_ALREADY_EXISTS, message: `Genre slug "${slug}" already exists` });
  }
}
