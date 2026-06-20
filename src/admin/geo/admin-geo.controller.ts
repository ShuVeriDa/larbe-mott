import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { PermissionCode } from "@prisma/client";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { AdminGeoService } from "./admin-geo.service";
import {
  CreateCountryDto,
  UpdateCountryDto,
  CreateRegionDto,
  UpdateRegionDto,
  CreateDistrictDto,
  UpdateDistrictDto,
  CreateSettlementDto,
  UpdateSettlementDto,
} from "./dto/upsert-geo-entry.dto";

@ApiTags("admin/geo")
@ApiBearerAuth()
@Controller("admin/geo")
export class AdminGeoController {
  constructor(private readonly adminGeoService: AdminGeoService) {}

  // ── Countries ──────────────────────────────────────────────────────────────

  @Get("countries")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "List all countries" })
  getCountries() {
    return this.adminGeoService.getCountries();
  }

  @Post("countries")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "Create a country" })
  createCountry(@Body() dto: CreateCountryDto) {
    return this.adminGeoService.createCountry(dto);
  }

  @Patch("countries/:id")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "Update a country" })
  updateCountry(@Param("id") id: string, @Body() dto: UpdateCountryDto) {
    return this.adminGeoService.updateCountry(id, dto);
  }

  @Delete("countries/:id")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "Delete a country" })
  deleteCountry(@Param("id") id: string) {
    return this.adminGeoService.deleteCountry(id);
  }

  // ── Regions ────────────────────────────────────────────────────────────────

  @Get("regions")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "List regions (optionally filter by countryId)" })
  @ApiQuery({ name: "countryId", required: false })
  getRegions(@Query("countryId") countryId?: string) {
    return this.adminGeoService.getRegions(countryId);
  }

  @Post("regions")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "Create a region" })
  createRegion(@Body() dto: CreateRegionDto) {
    return this.adminGeoService.createRegion(dto);
  }

  @Patch("regions/:id")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "Update a region" })
  updateRegion(@Param("id") id: string, @Body() dto: UpdateRegionDto) {
    return this.adminGeoService.updateRegion(id, dto);
  }

  @Delete("regions/:id")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "Delete a region" })
  deleteRegion(@Param("id") id: string) {
    return this.adminGeoService.deleteRegion(id);
  }

  // ── Districts ──────────────────────────────────────────────────────────────

  @Get("districts")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "List districts (optionally filter by regionId)" })
  @ApiQuery({ name: "regionId", required: false })
  getDistricts(@Query("regionId") regionId?: string) {
    return this.adminGeoService.getDistricts(regionId);
  }

  @Post("districts")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "Create a district" })
  createDistrict(@Body() dto: CreateDistrictDto) {
    return this.adminGeoService.createDistrict(dto);
  }

  @Patch("districts/:id")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "Update a district" })
  updateDistrict(@Param("id") id: string, @Body() dto: UpdateDistrictDto) {
    return this.adminGeoService.updateDistrict(id, dto);
  }

  @Delete("districts/:id")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "Delete a district" })
  deleteDistrict(@Param("id") id: string) {
    return this.adminGeoService.deleteDistrict(id);
  }

  // ── Settlements ────────────────────────────────────────────────────────────

  @Get("settlements")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "List settlements (optionally filter by districtId)" })
  @ApiQuery({ name: "districtId", required: false })
  getSettlements(@Query("districtId") districtId?: string) {
    return this.adminGeoService.getSettlements(districtId);
  }

  @Post("settlements")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "Create a settlement" })
  createSettlement(@Body() dto: CreateSettlementDto) {
    return this.adminGeoService.createSettlement(dto);
  }

  @Patch("settlements/:id")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "Update a settlement" })
  updateSettlement(@Param("id") id: string, @Body() dto: UpdateSettlementDto) {
    return this.adminGeoService.updateSettlement(id, dto);
  }

  @Delete("settlements/:id")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "Delete a settlement" })
  deleteSettlement(@Param("id") id: string) {
    return this.adminGeoService.deleteSettlement(id);
  }
}
