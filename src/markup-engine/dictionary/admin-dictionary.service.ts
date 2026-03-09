import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";

@Injectable()
export class AdminDictionaryService {
  constructor(private prisma: PrismaService) {}

  async findWords(words: string[]) {
    return this.prisma.adminDictionaryEntry.findMany({
      where: {
        word: {
          in: words,
        },
      },
      include: {
        headwords: true,
        morphForms: true,
      },
    });
  }
}
