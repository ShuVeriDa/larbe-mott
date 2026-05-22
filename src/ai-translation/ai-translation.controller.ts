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
import { Auth } from "src/auth/decorators/auth.decorator";
import { User } from "src/user/decorators/user.decorator";
import { AiTranslationService } from "./ai-translation.service";
import { SaveGeminiKeyDto } from "./dto/save-gemini-key.dto";
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

  @Post("key/verify")
  @Auth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Verify the saved Gemini API key with a test request" })
  @ApiOkResponse({ description: "{ valid: boolean, error?: string }" })
  verifyKey(@User("id") userId: string) {
    return this.aiTranslationService.verifyGeminiKey(userId);
  }

  // ─── Translation ─────────────────────────────────────────────────────────────

  @Post("translate/word")
  @Auth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Translate a Chechen word via Gemini (with cache)" })
  translateWord(@User("id") userId: string, @Body() dto: TranslateWordDto) {
    return this.aiTranslationService.translateWord(userId, dto);
  }

  @Post("translate/phrase")
  @Auth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Translate a Chechen phrase via Gemini (not cached)" })
  translatePhrase(@User("id") userId: string, @Body() dto: TranslatePhraseDto) {
    return this.aiTranslationService.translatePhrase(userId, dto);
  }

  // ─── Voting ──────────────────────────────────────────────────────────────────

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
