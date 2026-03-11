import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { normalizeToken } from "../tokenizer/tokenizer.utils";

@Injectable()
export class NormalizerService {
  constructor(private prisma: PrismaService) {}

  async normalizeVersion(versionId: string) {
    const tokens = await this.prisma.textToken.findMany({
      where: { versionId },
      select: {
        id: true,
        original: true,
      },
    });

    if (!tokens.length) return;

    const updates = tokens.map((t) => ({
      id: t.id,
      normalized: normalizeToken(t.original),
    }));

    await this.prisma.$transaction(
      updates.map((u) =>
        this.prisma.textToken.update({
          where: { id: u.id },
          data: { normalized: u.normalized },
        }),
      ),
    );
  }
}
