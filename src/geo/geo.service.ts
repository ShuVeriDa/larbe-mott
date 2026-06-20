import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { ErrorCode } from "src/common/errors/error-codes";
import type { GeoListQueryDto } from "./dto/geo-query.dto";

const CACHE_HEADERS = "public, max-age=3600";

@Injectable()
export class GeoService {
  constructor(private readonly prisma: PrismaService) {}

  getCacheHeaders() {
    return CACHE_HEADERS;
  }

  async findAllCountries(dto: GeoListQueryDto) {
    const { limit = 100, offset = 0 } = dto;
    const [items, total] = await Promise.all([
      this.prisma.geoCountry.findMany({
        select: { id: true, code: true, name: true },
        orderBy: { code: "asc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.geoCountry.count(),
    ]);
    return { items, total, limit, offset };
  }

  async findRegionsByCountry(countryId: string, dto: GeoListQueryDto) {
    await this.assertCountryExists(countryId);
    const { limit = 100, offset = 0 } = dto;
    const [items, total] = await Promise.all([
      this.prisma.geoRegion.findMany({
        where: { countryId },
        select: { id: true, countryId: true, name: true },
        orderBy: { id: "asc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.geoRegion.count({ where: { countryId } }),
    ]);
    return { items, total, limit, offset };
  }

  async findDistrictsByRegion(regionId: string, dto: GeoListQueryDto) {
    await this.assertRegionExists(regionId);
    const { limit = 200, offset = 0 } = dto;
    const [items, total] = await Promise.all([
      this.prisma.geoDistrict.findMany({
        where: { regionId },
        select: { id: true, regionId: true, name: true },
        orderBy: { id: "asc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.geoDistrict.count({ where: { regionId } }),
    ]);
    return { items, total, limit, offset };
  }

  async findSettlementsByDistrict(districtId: string, dto: GeoListQueryDto) {
    await this.assertDistrictExists(districtId);
    const { limit = 200, offset = 0 } = dto;
    const [items, total] = await Promise.all([
      this.prisma.geoSettlement.findMany({
        where: { districtId },
        select: { id: true, districtId: true, name: true, type: true },
        orderBy: { id: "asc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.geoSettlement.count({ where: { districtId } }),
    ]);
    return { items, total, limit, offset };
  }

  private async assertCountryExists(countryId: string) {
    const found = await this.prisma.geoCountry.findUnique({
      where: { id: countryId },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException({
        code: ErrorCode.GEO_COUNTRY_NOT_FOUND,
        message: `Country #${countryId} not found`,
      });
    }
  }

  private async assertRegionExists(regionId: string) {
    const found = await this.prisma.geoRegion.findUnique({
      where: { id: regionId },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException({
        code: ErrorCode.GEO_REGION_NOT_FOUND,
        message: `Region #${regionId} not found`,
      });
    }
  }

  private async assertDistrictExists(districtId: string) {
    const found = await this.prisma.geoDistrict.findUnique({
      where: { id: districtId },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException({
        code: ErrorCode.GEO_DISTRICT_NOT_FOUND,
        message: `District #${districtId} not found`,
      });
    }
  }
}
