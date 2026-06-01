import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";

@Injectable()
export class GenreService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllGenres() {
    return this.prisma.genre.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, slug: true, sortOrder: true },
    });
  }
}
