import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";

@Injectable()
export class DictionaryCacheService {
  constructor(private prisma: PrismaService) {}

  async findWords(words: string[]) {
    return this.prisma.dictionaryCache.findMany({
      where: {
        normalized: { in: words },
      },
    });
  }
}
