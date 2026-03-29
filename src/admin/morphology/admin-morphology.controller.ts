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
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { PermissionCode } from "@prisma/client";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { AdminMorphologyService } from "./admin-morphology.service";
import { AnalyzeWordDto } from "./dto/analyze-word.dto";
import { BulkRulesDto } from "./dto/bulk-rules.dto";
import { CreateLemmaDto } from "./dto/create-lemma.dto";
import { CreateMorphFormDto } from "./dto/create-morph-form.dto";
import { CreateMorphologyRuleDto } from "./dto/create-morphology-rule.dto";
import { FetchLemmasDto } from "./dto/fetch-lemmas.dto";
import { FetchRulesDto } from "./dto/fetch-rules.dto";
import { UpdateLemmaDto } from "./dto/update-lemma.dto";
import { UpdateMorphFormDto } from "./dto/update-morph-form.dto";
import { UpdateMorphologyRuleDto } from "./dto/update-morphology-rule.dto";

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

  // ─── Morphology Rules ──────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_MORPHOLOGY)
  @Get("rules/stats")
  @ApiOperation({
    summary: "Get morphology rules statistics",
    description: "Returns total, active, inactive counts, regex count, total matches and token coverage.",
  })
  @ApiOkResponse({ description: "{ total, active, inactive, regexCount, totalMatches, coveragePct }" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  getRulesStats() {
    return this.service.getRulesStats();
  }

  @AdminPermission(PermissionCode.CAN_EDIT_MORPHOLOGY)
  @Get("rules")
  @ApiOperation({
    summary: "List morphology rules",
    description: "Paginated, filterable list of morphology rules.",
  })
  @ApiOkResponse({ description: "{ items, total, page, limit }" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  getRules(@Query() query: FetchRulesDto) {
    return this.service.getRules(query);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_MORPHOLOGY)
  @Post("rules")
  @ApiOperation({ summary: "Create morphology rule" })
  @ApiOkResponse({ description: "Created rule" })
  @ApiConflictResponse({ description: "Rule with this suffix+type+language already exists" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  createRule(@Body() dto: CreateMorphologyRuleDto) {
    return this.service.createRule(dto);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_MORPHOLOGY)
  @Patch("rules/:id")
  @ApiOperation({ summary: "Update morphology rule" })
  @ApiParam({ name: "id", description: "Rule UUID" })
  @ApiOkResponse({ description: "Updated rule" })
  @ApiNotFoundResponse({ description: "Rule not found" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  updateRule(@Param("id") id: string, @Body() dto: UpdateMorphologyRuleDto) {
    return this.service.updateRule(id, dto);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_MORPHOLOGY)
  @Delete("rules/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete morphology rule" })
  @ApiParam({ name: "id", description: "Rule UUID" })
  @ApiNoContentResponse({ description: "Deleted" })
  @ApiNotFoundResponse({ description: "Rule not found" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  async deleteRule(@Param("id") id: string) {
    await this.service.deleteRule(id);
  }

  // ─── Bulk operations ───────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_MORPHOLOGY)
  @Post("rules/bulk/activate")
  @ApiOperation({ summary: "Bulk activate rules" })
  @ApiOkResponse({ description: "{ updated: number }" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  bulkActivate(@Body() dto: BulkRulesDto) {
    return this.service.bulkActivateRules(dto);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_MORPHOLOGY)
  @Post("rules/bulk/deactivate")
  @ApiOperation({ summary: "Bulk deactivate rules" })
  @ApiOkResponse({ description: "{ updated: number }" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  bulkDeactivate(@Body() dto: BulkRulesDto) {
    return this.service.bulkDeactivateRules(dto);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_MORPHOLOGY)
  @Delete("rules/bulk")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Bulk delete rules" })
  @ApiOkResponse({ description: "{ deleted: number }" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  bulkDelete(@Body() dto: BulkRulesDto) {
    return this.service.bulkDeleteRules(dto);
  }

  // ─── Import ────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_EDIT_MORPHOLOGY)
  @Post("rules/import")
  @UseInterceptors(FileInterceptor("file"))
  @ApiConsumes("multipart/form-data")
  @ApiOperation({
    summary: "Import morphology rules from CSV or JSON",
    description:
      "CSV columns: pattern, add, pos, type, priority, description, language, isActive. " +
      "JSON: array of objects with the same fields. " +
      "Pass ?overwrite=true to update existing rules with the same suffix+type+language.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: {
        file: { type: "string", format: "binary", description: "CSV or JSON file" },
      },
    },
  })
  @ApiQuery({ name: "overwrite", required: false, type: Boolean, description: "Overwrite existing rules" })
  @ApiOkResponse({ description: "{ created, updated, skipped, total, errors }" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  importRules(
    @UploadedFile() file: Express.Multer.File,
    @Query("overwrite") overwrite?: string,
  ) {
    return this.service.importRules(file, overwrite === "true");
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
