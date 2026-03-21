import { Controller, Delete, Get, Param, Post } from "@nestjs/common";
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

@ApiTags("deck")
@ApiBearerAuth()
@Controller("deck")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class DeckController {
  constructor(private readonly deck: DeckService) {}

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
    description: "Returns word count per deck. Requires Premium.",
  })
  @ApiOkResponse({ description: "Deck statistics." })
  async getStats(@User("id") userId: string) {
    return this.deck.getStats(userId);
  }
}
