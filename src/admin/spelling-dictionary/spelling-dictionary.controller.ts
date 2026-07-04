import { Controller, Get, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AdminSpellingDictionaryService } from "./admin-spelling-dictionary.service";
import { FetchAllSpellingEntriesDto } from "./dto/fetch-all-spelling-entries.dto";

@ApiTags("spelling-dictionary")
@Controller("spelling-dictionary")
export class SpellingDictionaryController {
  constructor(
    private readonly spellingDictionaryService: AdminSpellingDictionaryService,
  ) {}

  @Get("all")
  @ApiOperation({
    summary: "Get full spelling dictionary",
    description: "Returns all entries (wrongForm → correctForm) for a given language (defaults to Chechen). Public endpoint, no auth required. Intended to be cached client-side for ~1 hour.",
  })
  @ApiOkResponse({ description: "Array of { id, wrongForm, correctForm, comment, language }" })
  getAllEntries(@Query() query: FetchAllSpellingEntriesDto) {
    return this.spellingDictionaryService.getAllEntries(query.language);
  }
}
