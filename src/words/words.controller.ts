import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  VERSION_NEUTRAL,
  Version,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Auth } from "src/auth/decorators/auth.decorator";
import { OptionalAuth } from "src/auth/decorators/optional-auth.decorator";
import { User } from "src/user/decorators/user.decorator";
import { AnalyzePosDto } from "./dto/analyze-pos.dto";
import { WordLookupByWordDto } from "./dto/lookup-by-word.dto";
import { WordLookupDto } from "./dto/lookup.dto";
import { WordExamplesService } from "./word-examples.service";
import { WordLookupByWordService } from "./word-lookup-by-word.service";
import type { AnalyzePosResult } from "./word-pos.service";
import { WordPosService } from "./word-pos.service";
import { WordsService } from "./words.service";

@ApiTags("words")
@ApiBearerAuth()
@Controller("words")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class WordsController {
  constructor(
    private readonly wordsService: WordsService,
    private readonly wordLookupByWordService: WordLookupByWordService,
    private readonly wordExamplesService: WordExamplesService,
    private readonly wordPosService: WordPosService,
  ) {}

  @Post("lookup")
  @OptionalAuth()
  @ApiOperation({
    summary: "Get word translation by tokenId (primary API for tap/click)",
    description:
      "On tap in the reader: the client passes tokenId. Returns translation, grammar, baseForm from cache/DB.",
  })
  @ApiBody({ type: WordLookupDto })
  @ApiOkResponse({
    description:
      "lemmaId, translation, tranAlt, grammar, baseForm, forms[], tags[], examples[], userStatus, inDictionary, dictionaryEntryId",
  })
  async lookup(
    @Body() dto: WordLookupDto,
    @User("id") userId: string | undefined,
  ) {
    return this.wordsService.lookup(dto.tokenId, userId);
  }

  @Auth()
  @Get(":lemmaId/examples")
  @ApiOperation({
    summary: "Corpus usage examples for a word",
    description:
      "Returns up to 10 snippets from different texts in the database where this lemma appears. Independent of user history.",
  })
  @ApiParam({ name: "lemmaId", description: "Lemma ID" })
  @ApiOkResponse({ description: "List of snippets with source information." })
  async getExamples(@Param("lemmaId", ParseUUIDPipe) lemmaId: string) {
    return this.wordExamplesService.getExamples(lemmaId);
  }

  @Auth()
  @Get(":lemmaId/related")
  @ApiOperation({
    summary: "Related words (synonyms / antonyms / cognates)",
    description:
      "Returns all WordRelations for the given lemma (in both directions), grouped by type. Used in the word card under 'Related words'.",
  })
  @ApiParam({ name: "lemmaId", description: "Lemma ID" })
  @ApiOkResponse({
    description:
      "[{ type, lemmaId, baseForm, transliteration, level, translation? }]",
  })
  async getRelated(@Param("lemmaId", ParseUUIDPipe) lemmaId: string) {
    return this.wordsService.getRelated(lemmaId);
  }

  @Post("lookup-by-word")
  @Auth()
  @ApiOperation({
    summary: "Get translation by word string (lookup chain)",
    description:
      "For a word entered by the user. Chain: admin override -> cache -> online -> morphology.",
  })
  @ApiBody({ type: WordLookupByWordDto })
  @ApiOkResponse({
    description: "translation, grammar, baseForm",
  })
  async lookupByWord(
    @Body() dto: WordLookupByWordDto,
    @User("id") userId: string,
  ) {
    return this.wordLookupByWordService.lookup(dto.normalized, userId);
  }

  @Post("parts-of-speech/analyze")
  @HttpCode(HttpStatus.OK)
  @Version(VERSION_NEUTRAL)
  @OptionalAuth()
  @ApiOperation({
    summary: "Identify parts of speech (Chechen: Khamelam daqosh) in text",
    description:
      "Returns the primary part of speech and alternative candidates for each token. " +
      "Uses a lemma/form dictionary and Chechen grammar heuristics.",
  })
  @ApiBody({ type: AnalyzePosDto })
  @ApiOkResponse({
    description:
      "text, totalTokens, analyzedWords, tokens[] with POS candidates",
  })
  async analyzePartsOfSpeech(
    @Body() dto: AnalyzePosDto,
  ): Promise<AnalyzePosResult> {
    return this.wordPosService.analyzeText(dto.text);
  }
}
