import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { ErrorCode } from "src/common/errors/error-codes";

const CACHE_HEADERS = "public, max-age=3600";

@Injectable()
export class HeritageService {
  constructor(private readonly prisma: PrismaService) {}

  getCacheHeaders() {
    return CACHE_HEADERS;
  }

  async findAllNations(limit: number, offset: number) {
    const [data, total] = await Promise.all([
      this.prisma.nation.findMany({
        select: { id: true, slug: true, name: true },
        orderBy: { slug: "asc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.nation.count(),
    ]);
    return { items: data, total, limit, offset };
  }

  async findTukhumyByNation(nationId: string, limit: number, offset: number) {
    await this.assertNationExists(nationId);
    const [data, total] = await Promise.all([
      this.prisma.tukhum.findMany({
        where: { nationId },
        select: { id: true, slug: true, name: true, nationId: true },
        orderBy: { slug: "asc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.tukhum.count({ where: { nationId } }),
    ]);
    return { items: data, total, limit, offset };
  }

  async findTaipsByNation(nationId: string, limit: number, offset: number) {
    await this.assertNationExists(nationId);
    const [data, total] = await Promise.all([
      this.prisma.taip.findMany({
        where: { nationId, status: "APPROVED" },
        select: { id: true, slug: true, name: true, nekyi: true, nationId: true, tukhumId: true },
        orderBy: { slug: "asc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.taip.count({ where: { nationId, status: "APPROVED" } }),
    ]);
    return { items: data, total, limit, offset };
  }

  async findTaipsByTukhum(tukhumId: string, limit: number, offset: number) {
    const tukhum = await this.prisma.tukhum.findUnique({
      where: { id: tukhumId },
      select: { id: true },
    });
    if (!tukhum) {
      throw new NotFoundException({
        code: ErrorCode.HERITAGE_TUKHUM_NOT_FOUND,
        message: `Tukhum #${tukhumId} not found`,
      });
    }
    const [data, total] = await Promise.all([
      this.prisma.taip.findMany({
        where: { tukhumId, status: "APPROVED" },
        select: { id: true, slug: true, name: true, nekyi: true, nationId: true, tukhumId: true },
        orderBy: { slug: "asc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.taip.count({ where: { tukhumId, status: "APPROVED" } }),
    ]);
    return { items: data, total, limit, offset };
  }

  async findGarasByTaip(taipId: string, limit: number, offset: number) {
    const taip = await this.prisma.taip.findUnique({
      where: { id: taipId },
      select: { id: true },
    });
    if (!taip) {
      throw new NotFoundException({
        code: ErrorCode.HERITAGE_TAIP_NOT_FOUND,
        message: `Taip #${taipId} not found`,
      });
    }
    const [data, total] = await Promise.all([
      this.prisma.gara.findMany({
        where: { taipId, status: "APPROVED" },
        select: { id: true, slug: true, name: true, nekyi: true, taipId: true },
        orderBy: { slug: "asc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.gara.count({ where: { taipId, status: "APPROVED" } }),
    ]);
    return { items: data, total, limit, offset };
  }

  private async assertNationExists(nationId: string) {
    const nation = await this.prisma.nation.findUnique({
      where: { id: nationId },
      select: { id: true },
    });
    if (!nation) {
      throw new NotFoundException({
        code: ErrorCode.HERITAGE_NATION_NOT_FOUND,
        message: `Nation #${nationId} not found`,
      });
    }
  }
}
