import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { ErrorCode } from "src/common/errors/error-codes";
import type {
  CreateCountryDto,
  UpdateCountryDto,
  CreateRegionDto,
  UpdateRegionDto,
  CreateDistrictDto,
  UpdateDistrictDto,
  CreateSettlementDto,
  UpdateSettlementDto,
} from "./dto/upsert-geo-entry.dto";

@Injectable()
export class AdminGeoService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Countries ──────────────────────────────────────────────────────────────

  async getCountries() {
    return this.prisma.geoCountry.findMany({
      select: { id: true, code: true, name: true, _count: { select: { regions: true } } },
      orderBy: { code: "asc" },
    });
  }

  async createCountry(dto: CreateCountryDto) {
    const existing = await this.prisma.geoCountry.findUnique({ where: { code: dto.code }, select: { id: true } });
    if (existing) {
      throw new ConflictException({ code: ErrorCode.GEO_COUNTRY_CODE_TAKEN, message: `Country code '${dto.code}' already exists` });
    }
    return this.prisma.geoCountry.create({ data: { code: dto.code, name: dto.name as object } });
  }

  async updateCountry(id: string, dto: UpdateCountryDto) {
    await this.assertCountryExists(id);
    if (dto.code) {
      const existing = await this.prisma.geoCountry.findFirst({ where: { code: dto.code, NOT: { id } }, select: { id: true } });
      if (existing) {
        throw new ConflictException({ code: ErrorCode.GEO_COUNTRY_CODE_TAKEN, message: `Country code '${dto.code}' already exists` });
      }
    }
    return this.prisma.geoCountry.update({
      where: { id },
      data: {
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.name !== undefined && { name: dto.name as object }),
      },
    });
  }

  async deleteCountry(id: string) {
    await this.assertCountryExists(id);
    await this.prisma.geoCountry.delete({ where: { id } });
    return { success: true };
  }

  // ── Regions ────────────────────────────────────────────────────────────────

  async getRegions(countryId?: string) {
    return this.prisma.geoRegion.findMany({
      where: countryId ? { countryId } : undefined,
      select: { id: true, countryId: true, name: true, _count: { select: { districts: true } } },
      orderBy: { id: "asc" },
    });
  }

  async createRegion(dto: CreateRegionDto) {
    await this.assertCountryExists(dto.countryId);
    return this.prisma.geoRegion.create({ data: { countryId: dto.countryId, name: dto.name as object } });
  }

  async updateRegion(id: string, dto: UpdateRegionDto) {
    await this.assertRegionExists(id);
    if (dto.countryId) await this.assertCountryExists(dto.countryId);
    return this.prisma.geoRegion.update({
      where: { id },
      data: {
        ...(dto.countryId !== undefined && { countryId: dto.countryId }),
        ...(dto.name !== undefined && { name: dto.name as object }),
      },
    });
  }

  async deleteRegion(id: string) {
    await this.assertRegionExists(id);
    await this.prisma.geoRegion.delete({ where: { id } });
    return { success: true };
  }

  // ── Districts ──────────────────────────────────────────────────────────────

  async getDistricts(regionId?: string) {
    return this.prisma.geoDistrict.findMany({
      where: regionId ? { regionId } : undefined,
      select: { id: true, regionId: true, name: true, _count: { select: { settlements: true } } },
      orderBy: { id: "asc" },
    });
  }

  async createDistrict(dto: CreateDistrictDto) {
    await this.assertRegionExists(dto.regionId);
    return this.prisma.geoDistrict.create({ data: { regionId: dto.regionId, name: dto.name as object } });
  }

  async updateDistrict(id: string, dto: UpdateDistrictDto) {
    await this.assertDistrictExists(id);
    if (dto.regionId) await this.assertRegionExists(dto.regionId);
    return this.prisma.geoDistrict.update({
      where: { id },
      data: {
        ...(dto.regionId !== undefined && { regionId: dto.regionId }),
        ...(dto.name !== undefined && { name: dto.name as object }),
      },
    });
  }

  async deleteDistrict(id: string) {
    await this.assertDistrictExists(id);
    await this.prisma.geoDistrict.delete({ where: { id } });
    return { success: true };
  }

  // ── Settlements ────────────────────────────────────────────────────────────

  async getSettlements(districtId?: string) {
    return this.prisma.geoSettlement.findMany({
      where: districtId ? { districtId } : undefined,
      select: { id: true, districtId: true, name: true, type: true },
      orderBy: { id: "asc" },
    });
  }

  async createSettlement(dto: CreateSettlementDto) {
    await this.assertDistrictExists(dto.districtId);
    return this.prisma.geoSettlement.create({ data: { districtId: dto.districtId, name: dto.name as object, type: dto.type } });
  }

  async updateSettlement(id: string, dto: UpdateSettlementDto) {
    await this.assertSettlementExists(id);
    if (dto.districtId) await this.assertDistrictExists(dto.districtId);
    return this.prisma.geoSettlement.update({
      where: { id },
      data: {
        ...(dto.districtId !== undefined && { districtId: dto.districtId }),
        ...(dto.name !== undefined && { name: dto.name as object }),
        ...(dto.type !== undefined && { type: dto.type }),
      },
    });
  }

  async deleteSettlement(id: string) {
    await this.assertSettlementExists(id);
    await this.prisma.geoSettlement.delete({ where: { id } });
    return { success: true };
  }

  // ── Guards ─────────────────────────────────────────────────────────────────

  private async assertCountryExists(id: string) {
    const found = await this.prisma.geoCountry.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException({ code: ErrorCode.GEO_COUNTRY_NOT_FOUND, message: `Country #${id} not found` });
  }

  private async assertRegionExists(id: string) {
    const found = await this.prisma.geoRegion.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException({ code: ErrorCode.GEO_REGION_NOT_FOUND, message: `Region #${id} not found` });
  }

  private async assertDistrictExists(id: string) {
    const found = await this.prisma.geoDistrict.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException({ code: ErrorCode.GEO_DISTRICT_NOT_FOUND, message: `District #${id} not found` });
  }

  private async assertSettlementExists(id: string) {
    const found = await this.prisma.geoSettlement.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException({ code: ErrorCode.GEO_SETTLEMENT_NOT_FOUND, message: `Settlement #${id} not found` });
  }
}
