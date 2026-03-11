import { Body, Controller, Post } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Auth } from "src/auth/decorators/auth.decorator";
import { User } from "src/user/decorators/user.decorator";
import { WordLookupDto } from "./dto/lookup.dto";
import { WordsService } from "./words.service";

@ApiTags("words")
@ApiBearerAuth()
@Controller("words")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class WordsController {
  constructor(private readonly wordsService: WordsService) {}

  @Post("lookup")
  @Auth()
  @ApiOperation({
    summary: "Look up word translation",
    description:
      "Returns translation, grammar, and base form for the word by token ID.",
  })
  @ApiBody({ type: WordLookupDto })
  @ApiOkResponse({
    description: "Object with translation, grammar, and baseForm.",
  })
  async lookup(@Body() dto: WordLookupDto, @User("id") userId: string) {
    return this.wordsService.lookup(dto.tokenId, userId);
  }
}
