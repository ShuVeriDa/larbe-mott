import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { normalizeToken } from "../tokenizer/tokenizer.utils";

@Injectable()
export class NormalizerService {
  constructor(private prisma: PrismaService) {}

  async normalizeVersion(versionId: string) {
    const tokens = await this.prisma.textToken.findMany({
      where: { versionId },
    });

    const updates = tokens.map((token) => {
      const normalized = normalizeToken(token.original);

      return this.prisma.textToken.update({
        where: { id: token.id },
        data: { normalized },
      });
    });

    await this.prisma.$transaction(updates);
  }
}
