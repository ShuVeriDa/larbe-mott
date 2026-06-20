import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { PermissionCode } from "@prisma/client";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { AdminHeritageService } from "./admin-heritage.service";
import { FetchPendingHeritageDto } from "./dto/fetch-pending-heritage.dto";
import { ReviewHeritageTaipDto } from "./dto/review-heritage-taip.dto";
import { ReviewHeritageGaraDto } from "./dto/review-heritage-gara.dto";
import {
  CreateGaraDto,
  CreateNationDto,
  CreateTaipDto,
  CreateTukhumDto,
  UpdateGaraDto,
  UpdateNationDto,
  UpdateTaipDto,
  UpdateTukhumDto,
} from "./dto/upsert-heritage-entry.dto";

@ApiTags("admin/heritage")
@ApiBearerAuth()
@Controller("admin/heritage")
export class AdminHeritageController {
  constructor(private readonly adminHeritageService: AdminHeritageService) {}

  // ─── Stats ────────────────────────────────────────────────────────────────────

  @Get("stats")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "Heritage moderation stats: pending / approved / rejected counts" })
  getStats() {
    return this.adminHeritageService.getStats();
  }

  // ─── Moderation ───────────────────────────────────────────────────────────────

  @Get("pending")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "List pending heritage submissions (custom taip / gara)" })
  getPendingSubmissions(@Query() dto: FetchPendingHeritageDto) {
    return this.adminHeritageService.getPendingSubmissions(dto);
  }

  @Patch(":heritageId/taip")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({
    summary: "Review custom taip: verify or reject. Optionally add to official directory.",
  })
  reviewTaip(
    @Param("heritageId") heritageId: string,
    @Body() dto: ReviewHeritageTaipDto,
  ) {
    return this.adminHeritageService.reviewTaip(heritageId, dto);
  }

  @Patch(":heritageId/gara")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({
    summary: "Review custom gara: verify or reject. Optionally add to official directory.",
  })
  reviewGara(
    @Param("heritageId") heritageId: string,
    @Body() dto: ReviewHeritageGaraDto,
  ) {
    return this.adminHeritageService.reviewGara(heritageId, dto);
  }

  // ─── Nations CRUD ─────────────────────────────────────────────────────────────

  @Get("nations")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "List all nations" })
  getNations() {
    return this.adminHeritageService.getNations();
  }

  @Post("nations")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "Create a nation" })
  createNation(@Body() dto: CreateNationDto) {
    return this.adminHeritageService.createNation(dto);
  }

  @Patch("nations/:id")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "Update a nation" })
  updateNation(@Param("id") id: string, @Body() dto: UpdateNationDto) {
    return this.adminHeritageService.updateNation(id, dto);
  }

  @Delete("nations/:id")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "Delete a nation" })
  deleteNation(@Param("id") id: string) {
    return this.adminHeritageService.deleteNation(id);
  }

  // ─── Tukhumy CRUD ─────────────────────────────────────────────────────────────

  @Get("tukhumy")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "List tukhumy (optionally filter by nationId)" })
  @ApiQuery({ name: "nationId", required: false })
  getTukhumy(@Query("nationId") nationId?: string) {
    return this.adminHeritageService.getTukhumy(nationId);
  }

  @Post("tukhumy")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "Create a tukhum" })
  createTukhum(@Body() dto: CreateTukhumDto) {
    return this.adminHeritageService.createTukhum(dto);
  }

  @Patch("tukhumy/:id")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "Update a tukhum" })
  updateTukhum(@Param("id") id: string, @Body() dto: UpdateTukhumDto) {
    return this.adminHeritageService.updateTukhum(id, dto);
  }

  @Delete("tukhumy/:id")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "Delete a tukhum" })
  deleteTukhum(@Param("id") id: string) {
    return this.adminHeritageService.deleteTukhum(id);
  }

  // ─── Taips CRUD ───────────────────────────────────────────────────────────────

  @Get("taips")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "List taips (filter by nationId and/or tukhumId)" })
  @ApiQuery({ name: "nationId", required: false })
  @ApiQuery({ name: "tukhumId", required: false })
  getTaips(
    @Query("nationId") nationId?: string,
    @Query("tukhumId") tukhumId?: string,
  ) {
    return this.adminHeritageService.getTaips(nationId, tukhumId);
  }

  @Post("taips")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "Create a taip" })
  createTaip(@Body() dto: CreateTaipDto) {
    return this.adminHeritageService.createTaip(dto);
  }

  @Patch("taips/:id")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "Update a taip" })
  updateTaip(@Param("id") id: string, @Body() dto: UpdateTaipDto) {
    return this.adminHeritageService.updateTaip(id, dto);
  }

  @Delete("taips/:id")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "Delete a taip" })
  deleteTaip(@Param("id") id: string) {
    return this.adminHeritageService.deleteTaip(id);
  }

  // ─── Garas CRUD ───────────────────────────────────────────────────────────────

  @Get("garas")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "List garas (optionally filter by taipId)" })
  @ApiQuery({ name: "taipId", required: false })
  getGaras(@Query("taipId") taipId?: string) {
    return this.adminHeritageService.getGaras(taipId);
  }

  @Post("garas")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "Create a gara" })
  createGara(@Body() dto: CreateGaraDto) {
    return this.adminHeritageService.createGara(dto);
  }

  @Patch("garas/:id")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "Update a gara" })
  updateGara(@Param("id") id: string, @Body() dto: UpdateGaraDto) {
    return this.adminHeritageService.updateGara(id, dto);
  }

  @Delete("garas/:id")
  @AdminPermission(PermissionCode.CAN_MANAGE_HERITAGE)
  @ApiOperation({ summary: "Delete a gara" })
  deleteGara(@Param("id") id: string) {
    return this.adminHeritageService.deleteGara(id);
  }
}
