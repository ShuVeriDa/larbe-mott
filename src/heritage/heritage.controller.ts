import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
  Res,
} from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { HeritageService } from "./heritage.service";

@ApiTags("heritage")
@Controller("heritage")
export class HeritageController {
  constructor(private readonly heritageService: HeritageService) {}

  private setCacheHeaders(res: Response) {
    res.setHeader("Cache-Control", this.heritageService.getCacheHeaders());
  }

  @Get("nations")
  @ApiOperation({ summary: "Список всех наций" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  async nations(
    @Res({ passthrough: true }) res: Response,
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    this.setCacheHeaders(res);
    return this.heritageService.findAllNations(limit, offset);
  }

  @Get("nations/:id/tukhumy")
  @ApiOperation({ summary: "Тукхумы нации" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  async tukhumyByNation(
    @Res({ passthrough: true }) res: Response,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    this.setCacheHeaders(res);
    return this.heritageService.findTukhumyByNation(id, limit, offset);
  }

  @Get("nations/:id/taips")
  @ApiOperation({ summary: "Все тайпы нации (включая тайпы без тукхума)" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  async taipsByNation(
    @Res({ passthrough: true }) res: Response,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    this.setCacheHeaders(res);
    return this.heritageService.findTaipsByNation(id, limit, offset);
  }

  @Get("tukhumy/:id/taips")
  @ApiOperation({ summary: "Тайпы конкретного тукхума" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  async taipsByTukhum(
    @Res({ passthrough: true }) res: Response,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    this.setCacheHeaders(res);
    return this.heritageService.findTaipsByTukhum(id, limit, offset);
  }

  @Get("taips/:id/garas")
  @ApiOperation({ summary: "Гары тайпа" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  async garasByTaip(
    @Res({ passthrough: true }) res: Response,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    this.setCacheHeaders(res);
    return this.heritageService.findGarasByTaip(id, limit, offset);
  }
}
