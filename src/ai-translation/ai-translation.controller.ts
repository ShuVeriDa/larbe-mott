import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Auth } from "src/auth/decorators/auth.decorator";
import { User } from "src/user/decorators/user.decorator";
import { AiTranslationService } from "./ai-translation.service";
import { BatchTranslateDto } from "./dto/batch-translate.dto";
import { RefinePhraseDto } from "./dto/refine-phrase.dto";
import { SaveGeminiKeyDto } from "./dto/save-gemini-key.dto";
import { SaveGeminiModelDto } from "./dto/save-gemini-model.dto";
import { SaveRefinementDto } from "./dto/save-refinement.dto";
import { TranslatePhraseDto } from "./dto/translate-phrase.dto";
import { TranslateWordDto } from "./dto/translate-word.dto";
import { VoteCacheDto } from "./dto/vote-cache.dto";

@ApiTags("ai-translation")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@Controller("ai-translation")
export class AiTranslationController {
  constructor(private readonly aiTranslationService: AiTranslationService) {}

  // ─── Gemini Key ──────────────────────────────────────────────────────────────

  @Get("key/status")
  @Auth()
  @ApiOperation({ summary: "Check if user has a Gemini API key saved" })
  @ApiOkResponse({ description: "{ hasKey: boolean }" })
  getKeyStatus(@User("id") userId: string) {
    return this.aiTranslationService.getKeyStatus(userId);
  }

  @Patch("key")
  @Auth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Save or delete Gemini API key" })
  @ApiOkResponse({ description: "{ hasKey: boolean }" })
  saveKey(@User("id") userId: string, @Body() dto: SaveGeminiKeyDto) {
    return this.aiTranslationService.saveGeminiKey(userId, dto.apiKey);
  }

  @Delete("key")
  @Auth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete saved Gemini API key" })
  @ApiOkResponse({ description: "{ hasKey: false }" })
  deleteKey(@User("id") userId: string) {
    return this.aiTranslationService.saveGeminiKey(userId, null);
  }

  @Patch("model")
  @Auth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Save preferred Gemini model for translations" })
  @ApiOkResponse({ description: "{ model: string }" })
  saveModel(@User("id") userId: string, @Body() dto: SaveGeminiModelDto) {
    return this.aiTranslationService.saveGeminiModel(userId, dto.model);
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post("key/verify")
  @Auth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Verify the saved Gemini API key with a test request" })
  @ApiOkResponse({ description: "{ valid: boolean, error?: string }" })
  verifyKey(@User("id") userId: string) {
    return this.aiTranslationService.verifyGeminiKey(userId);
  }

  // ─── Translation ─────────────────────────────────────────────────────────────

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post("translate/word")
  @Auth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Translate a Chechen word via Gemini (with cache)" })
  translateWord(@User("id") userId: string, @Body() dto: TranslateWordDto) {
    return this.aiTranslationService.translateWord(userId, dto);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("translate/phrase")
  @Auth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Translate a Chechen phrase via Gemini (not cached)" })
  translatePhrase(@User("id") userId: string, @Body() dto: TranslatePhraseDto) {
    return this.aiTranslationService.translatePhrase(userId, dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("translate/batch")
  @Auth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Batch-translate multiple Chechen words via Gemini (one request)" })
  batchTranslate(@User("id") userId: string, @Body() dto: BatchTranslateDto) {
    return this.aiTranslationService.batchTranslate(userId, dto);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("translate/phrase/refine")
  @Auth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Refine a phrase translation with a user hint" })
  refinePhrase(@User("id") userId: string, @Body() dto: RefinePhraseDto) {
    return this.aiTranslationService.refinePhrase(userId, dto);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post("cache/save-refinement")
  @Auth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Save a refined word translation to AI cache (PENDING)" })
  saveRefinement(@Body() dto: SaveRefinementDto) {
    return this.aiTranslationService.saveRefinement(dto);
  }

  // ─── Voting ──────────────────────────────────────────────────────────────────

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post("cache/:id/vote")
  @Auth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Vote on a cached AI translation (thumbs up/down)" })
  vote(
    @Param("id", ParseUUIDPipe) cacheId: string,
    @Body() dto: VoteCacheDto,
  ) {
    return this.aiTranslationService.vote(cacheId, dto.vote);
  }
}
