import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { GeoService } from "./geo.service";
import { GeoListQueryDto } from "./dto/geo-query.dto";

@ApiTags("geo")
@Controller("geo")
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  private setCacheHeaders(res: Response) {
    res.setHeader("Cache-Control", this.geoService.getCacheHeaders());
  }

  @Get("countries")
  @ApiOperation({ summary: "List all countries" })
  async countries(
    @Res({ passthrough: true }) res: Response,
    @Query() dto: GeoListQueryDto,
  ) {
    this.setCacheHeaders(res);
    return this.geoService.findAllCountries(dto);
  }

  @Get("countries/:id/regions")
  @ApiOperation({ summary: "List regions by country" })
  async regionsByCountry(
    @Res({ passthrough: true }) res: Response,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() dto: GeoListQueryDto,
  ) {
    this.setCacheHeaders(res);
    return this.geoService.findRegionsByCountry(id, dto);
  }

  @Get("regions/:id/districts")
  @ApiOperation({ summary: "List districts by region" })
  async districtsByRegion(
    @Res({ passthrough: true }) res: Response,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() dto: GeoListQueryDto,
  ) {
    this.setCacheHeaders(res);
    return this.geoService.findDistrictsByRegion(id, dto);
  }

  @Get("districts/:id/settlements")
  @ApiOperation({ summary: "List settlements by district" })
  async settlementsByDistrict(
    @Res({ passthrough: true }) res: Response,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() dto: GeoListQueryDto,
  ) {
    this.setCacheHeaders(res);
    return this.geoService.findSettlementsByDistrict(id, dto);
  }
}
