import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { RequiresPremium } from "src/auth/decorators/premium.decorator";
import { User } from "src/user/decorators/user.decorator";
import { DeckService } from "./deck.service";
import { RateCardDto } from "./dto/rate-card.dto";
import { UpdateDeckSettingsDto } from "./dto/update-settings.dto";

@ApiTags("deck")
@ApiBearerAuth()
@Controller("deck")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class DeckController {
  constructor(private readonly deck: DeckService) {}

  // ─── settings ────────────────────────────────────────────────────────────────

  @RequiresPremium()
  @Get("settings")
  @ApiOperation({
    summary: "Get deck settings",
    description: "Returns dailyWordCount and deckMaxSize for the current user. Requires Premium.",
  })
  @ApiOkResponse({ description: "Current deck settings." })
  async getSettings(@User("id") userId: string) {
    return this.deck.getSettings(userId);
  }

  @RequiresPremium()
  @Patch("settings")
  @ApiOperation({
    summary: "Update deck settings",
    description: "Update dailyWordCount (3 | 5 | 10) and/or deckMaxSize (10–500). Requires Premium.",
  })
  @ApiOkResponse({ description: "Updated deck state." })
  async updateSettings(
    @User("id") userId: string,
    @Body() dto: UpdateDeckSettingsDto,
  ) {
    return this.deck.updateSettings(userId, dto.dailyWordCount, dto.deckMaxSize);
  }

  // ─── add / remove ────────────────────────────────────────────────────────────

  @RequiresPremium()
  @Post("add/:lemmaId")
  @ApiOperation({
    summary: "Add word to deck",
    description: "Adds lemma to the New deck and auto-rebalances all decks. Requires Premium.",
  })
  @ApiParam({ name: "lemmaId", description: "Lemma ID" })
  @ApiOkResponse({ description: "Created or existing deck card." })
  async addWord(
    @Param("lemmaId") lemmaId: string,
    @User("id") userId: string,
  ) {
    return this.deck.addWord(userId, lemmaId);
  }

  @RequiresPremium()
  @Delete("remove/:lemmaId")
  @ApiOperation({
    summary: "Remove word from deck",
    description: "Removes lemma from all decks. Requires Premium.",
  })
  @ApiParam({ name: "lemmaId", description: "Lemma ID" })
  @ApiOkResponse({ description: "Deletion result." })
  async removeWord(
    @Param("lemmaId") lemmaId: string,
    @User("id") userId: string,
  ) {
    return this.deck.removeWord(userId, lemmaId);
  }

  // ─── rate ────────────────────────────────────────────────────────────────────

  @RequiresPremium()
  @Post("rate/:lemmaId")
  @ApiOperation({
    summary: "Rate a deck card",
    description:
      "Submit review result for a card. 'know' updates movedAt (sends card to FIFO end), 'again' leaves card unchanged. Requires Premium.",
  })
  @ApiParam({ name: "lemmaId", description: "Lemma ID" })
  @ApiOkResponse({ description: "Updated deck card." })
  async rateCard(
    @Param("lemmaId") lemmaId: string,
    @User("id") userId: string,
    @Body() dto: RateCardDto,
  ) {
    return this.deck.rateCard(userId, lemmaId, dto.result);
  }

  // ─── daily words ─────────────────────────────────────────────────────────────

  @RequiresPremium()
  @Get("daily")
  @ApiOperation({
    summary: "Get daily words to add to deck",
    description:
      "Returns N words from the user's dictionary not yet in any deck. N = dailyWordCount setting. Requires Premium.",
  })
  @ApiOkResponse({ description: "List of dictionary entries ready to be added to the deck." })
  async getDailyWords(@User("id") userId: string) {
    return this.deck.getDailyWords(userId);
  }

  // ─── due / stats ─────────────────────────────────────────────────────────────

  @RequiresPremium()
  @Get("due")
  @ApiOperation({
    summary: "Get today's review cards",
    description:
      "Returns cards from New, Old, Retired and today's numbered deck (rotating daily). Requires Premium.",
  })
  @ApiOkResponse({ description: "Cards grouped by deck type." })
  async getDueCards(@User("id") userId: string) {
    return this.deck.getDueCards(userId);
  }

  @RequiresPremium()
  @Get("stats")
  @ApiOperation({
    summary: "Get deck statistics",
    description: "Returns word count per deck and current settings. Requires Premium.",
  })
  @ApiOkResponse({ description: "Deck statistics with settings." })
  async getStats(@User("id") userId: string) {
    return this.deck.getStats(userId);
  }
}
