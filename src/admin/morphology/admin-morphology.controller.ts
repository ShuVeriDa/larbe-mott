import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { PermissionCode } from "@prisma/client";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { AdminMorphologyService } from "./admin-morphology.service";
import { AnalyzeWordDto } from "./dto/analyze-word.dto";
import { CreateLemmaDto } from "./dto/create-lemma.dto";
import { CreateMorphFormDto } from "./dto/create-morph-form.dto";
import { FetchLemmasDto } from "./dto/fetch-lemmas.dto";
import { UpdateLemmaDto } from "./dto/update-lemma.dto";
import { UpdateMorphFormDto } from "./dto/update-morph-form.dto";

@ApiTags("admin/morphology")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@Controller("admin/morphology")
export class AdminMorphologyController {
  constructor(private readonly service: AdminMorphologyService) {}

  // ─── Lemmas ────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_MORPHOLOGY)
  @Get("lemmas")
  @ApiOperation({ summary: "List lemmas", description: "Paginated list of lemmas with form count." })
  @ApiOkResponse({ description: "{ items, total, page, limit }" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  getLemmas(@Query() query: FetchLemmasDto) {
    return this.service.getLemmas(query);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_MORPHOLOGY)
  @Get("lemmas/:id")
  @ApiOperation({ summary: "Get lemma by id", description: "Returns lemma with all morph forms." })
  @ApiParam({ name: "id", description: "Lemma UUID" })
  @ApiOkResponse({ description: "Lemma with morphForms[]" })
  @ApiNotFoundResponse({ description: "Lemma not found" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  getLemmaById(@Param("id") id: string) {
    return this.service.getLemmaById(id);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_MORPHOLOGY)
  @Post("lemmas")
  @ApiOperation({ summary: "Create lemma" })
  @ApiOkResponse({ description: "Created lemma" })
  @ApiConflictResponse({ description: "Lemma with this normalized form already exists" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  createLemma(@Body() dto: CreateLemmaDto) {
    return this.service.createLemma(dto);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_MORPHOLOGY)
  @Patch("lemmas/:id")
  @ApiOperation({ summary: "Update lemma" })
  @ApiParam({ name: "id", description: "Lemma UUID" })
  @ApiOkResponse({ description: "Updated lemma" })
  @ApiNotFoundResponse({ description: "Lemma not found" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  updateLemma(@Param("id") id: string, @Body() dto: UpdateLemmaDto) {
    return this.service.updateLemma(id, dto);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_MORPHOLOGY)
  @Delete("lemmas/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete lemma", description: "Deletes lemma and all its morph forms (cascade)." })
  @ApiParam({ name: "id", description: "Lemma UUID" })
  @ApiNoContentResponse({ description: "Deleted" })
  @ApiNotFoundResponse({ description: "Lemma not found" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  async deleteLemma(@Param("id") id: string) {
    await this.service.deleteLemma(id);
  }

  // ─── Morph forms ───────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_MORPHOLOGY)
  @Post("lemmas/:id/forms")
  @ApiOperation({ summary: "Add morph form to lemma" })
  @ApiParam({ name: "id", description: "Lemma UUID" })
  @ApiOkResponse({ description: "Created morph form" })
  @ApiConflictResponse({ description: "Form already exists for this lemma" })
  @ApiNotFoundResponse({ description: "Lemma not found" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  addMorphForm(@Param("id") id: string, @Body() dto: CreateMorphFormDto) {
    return this.service.addMorphForm(id, dto);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_MORPHOLOGY)
  @Patch("forms/:id")
  @ApiOperation({ summary: "Update morph form" })
  @ApiParam({ name: "id", description: "MorphForm UUID" })
  @ApiOkResponse({ description: "Updated morph form" })
  @ApiNotFoundResponse({ description: "Morph form not found" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  updateMorphForm(@Param("id") id: string, @Body() dto: UpdateMorphFormDto) {
    return this.service.updateMorphForm(id, dto);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_MORPHOLOGY)
  @Delete("forms/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete morph form" })
  @ApiParam({ name: "id", description: "MorphForm UUID" })
  @ApiNoContentResponse({ description: "Deleted" })
  @ApiNotFoundResponse({ description: "Morph form not found" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  async deleteMorphForm(@Param("id") id: string) {
    await this.service.deleteMorphForm(id);
  }

  // ─── Analysis ──────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_MORPHOLOGY)
  @Post("analyze")
  @ApiOperation({
    summary: "Test morphology analysis",
    description: "Runs the full morphology pipeline on a word and returns the analysis result.",
  })
  @ApiOkResponse({ description: "{ word, result }" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  analyzeWord(@Body() dto: AnalyzeWordDto) {
    return this.service.analyzeWord(dto);
  }
}
