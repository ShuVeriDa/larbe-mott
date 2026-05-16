import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Language, PermissionCode } from "@prisma/client";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { IsArray, IsIn, IsOptional, IsString, IsUUID, MinLength, MaxLength } from "class-validator";
import { AdminAnnotationService } from "./admin-annotation.service";
import type { AnnotateScope } from "./admin-annotation.service";

class AnnotateTokenDto {
  @IsUUID()
  lemmaId: string;

  @IsIn(["local", "global"])
  scope: AnnotateScope;
}

class CreateMorphFormDto {
  @IsString()
  @MinLength(1)
  normalized: string;

  @IsUUID()
  lemmaId: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  translation?: string;
}

class BatchAnnotateDto {
  @IsArray()
  @IsString({ each: true })
  tokenIds: string[];

  @IsString()
  @MinLength(1)
  normalized: string;

  @IsUUID()
  lemmaId: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  translation?: string;
}

class PatchMorphFormDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  translation?: string;
}

class UnannotateTokensDto {
  @IsArray()
  @IsString({ each: true })
  tokenIds: string[];
}

class SearchLemmasDto {
  @IsString()
  q: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  limit?: string;
}

@ApiTags("admin/annotation")
@ApiBearerAuth()
@Controller("admin")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@ApiForbiddenResponse({ description: "Requires CAN_EDIT_TEXTS permission" })
export class AdminAnnotationController {
  constructor(private readonly service: AdminAnnotationService) {}

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get("lemmas/search")
  @ApiOperation({
    summary: "Search lemmas for word annotation",
    description:
      "Full-text search on lemma baseForm and normalized. Returns up to 20 results with baseForm, partOfSpeech, and primary dictionary translation.",
  })
  @ApiQuery({ name: "q", description: "Search query (min 2 chars)" })
  @ApiQuery({ name: "language", required: false, enum: Language })
  @ApiQuery({ name: "limit", required: false })
  searchLemmas(
    @Query("q") q: string,
    @Query("language") language?: string,
    @Query("limit") limit?: string,
  ) {
    const lang =
      language && Object.values(Language).includes(language as Language)
        ? (language as Language)
        : Language.CHE;
    return this.service.searchLemmas(q, lang, limit ? parseInt(limit, 10) : 20);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post("morph-forms")
  @ApiOperation({
    summary: "Create a global MorphForm mapping",
    description:
      "Creates or updates a MorphForm record that globally maps a normalized word form to a lemma. Unlike token annotation, this does not require a specific tokenId — it applies to all texts.",
  })
  createMorphForm(@Body() dto: CreateMorphFormDto) {
    return this.service.createMorphForm(dto.normalized, dto.lemmaId, dto.translation);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get("token-occurrences")
  @ApiOperation({ summary: "Get all occurrences of a word form in a text with context snippets" })
  @ApiQuery({ name: "normalized", description: "Normalized word form" })
  @ApiQuery({ name: "textId", description: "Text ID" })
  getTokenOccurrences(
    @Query("normalized") normalized: string,
    @Query("textId") textId: string,
  ) {
    return this.service.getTokenOccurrences(normalized, textId);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post("tokens/batch-annotate")
  @ApiOperation({
    summary: "Batch annotate selected tokens and create a global MorphForm",
    description: "Annotates specific tokens with a lemma and upserts a MorphForm for future tokenizations.",
  })
  batchAnnotateWithMorphForm(@Body() dto: BatchAnnotateDto) {
    return this.service.batchAnnotateWithMorphForm(
      dto.tokenIds,
      dto.normalized,
      dto.lemmaId,
      dto.translation,
    );
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get("annotated-forms")
  @ApiOperation({ summary: "Get annotated word forms for a specific page (for editor highlighting)" })
  @ApiQuery({ name: "textId" })
  @ApiQuery({ name: "pageNumber" })
  getAnnotatedFormsByPage(
    @Query("textId") textId: string,
    @Query("pageNumber") pageNumber: string,
  ) {
    return this.service.getAnnotatedFormsByPage(textId, parseInt(pageNumber, 10) || 1);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get("morph-forms")
  @ApiOperation({ summary: "List MorphForms with pagination and optional search" })
  listMorphForms(
    @Query("q") q?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.listMorphForms(q, page ? parseInt(page, 10) : 1, limit ? parseInt(limit, 10) : 50);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post("morph-forms/sync")
  @ApiOperation({
    summary: "Backfill MorphForm records from existing ADMIN TokenAnalysis",
    description: "Creates missing MorphForm entries for all (normalized, lemmaId) pairs that have ADMIN annotations but no MorphForm. Run once after data migration.",
  })
  syncMorphForms() {
    return this.service.syncMorphForms();
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get("morph-forms/:id/occurrences")
  @ApiOperation({ summary: "Get all annotated token occurrences for a MorphForm with context snippets" })
  getMorphFormOccurrences(@Param("id") id: string) {
    return this.service.getMorphFormOccurrences(id);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get("morph-forms/:id")
  @ApiOperation({ summary: "Get a single MorphForm with token count" })
  getMorphForm(@Param("id") id: string) {
    return this.service.getMorphForm(id);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Patch("morph-forms/:id")
  @ApiOperation({ summary: "Update MorphForm translation" })
  updateMorphForm(@Param("id") id: string, @Body() dto: PatchMorphFormDto) {
    return this.service.updateMorphForm(id, dto.translation);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Delete("morph-forms/:id")
  @ApiOperation({ summary: "Delete MorphForm and demote related ADMIN TokenAnalysis records" })
  deleteMorphForm(@Param("id") id: string) {
    return this.service.deleteMorphForm(id);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post("tokens/unannotate")
  @ApiOperation({
    summary: "Remove ADMIN annotation from specific tokens",
    description: "Deletes ADMIN-source TokenAnalysis records for the given tokens without removing the MorphForm.",
  })
  unannotateTokens(@Body() dto: UnannotateTokensDto) {
    return this.service.unannotateTokens(dto.tokenIds);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post("tokens/:tokenId/annotate")
  @ApiOperation({
    summary: "Annotate token with correct lemma",
    description: `Links a token to the correct lemma.
- scope=local: sets isPrimary=true on TokenAnalysis for this specific token only (fixes context-specific mis-translation, e.g. homographs).
- scope=global: also creates a MorphForm record so the word form is recognized globally across all texts.
Invalidates token cache in both cases.`,
  })
  @ApiParam({ name: "tokenId", description: "Token ID (cuid)" })
  annotateToken(
    @Param("tokenId") tokenId: string,
    @Body() dto: AnnotateTokenDto,
  ) {
    return this.service.annotateToken(tokenId, dto.lemmaId, dto.scope);
  }
}
