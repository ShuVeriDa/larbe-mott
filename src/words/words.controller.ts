import { Body, Controller, Get, Param, Post } from "@nestjs/common";
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
import { WordLookupByWordDto } from "./dto/lookup-by-word.dto";
import { WordLookupDto } from "./dto/lookup.dto";
import { WordExamplesService } from "./word-examples.service";
import { WordLookupByWordService } from "./word-lookup-by-word.service";
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
  ) {}

  @Post("lookup")
  @OptionalAuth()
  @ApiOperation({
    summary: "Получить перевод слова по tokenId (основной API для клика)",
    description:
      "По клику в тексте: фронт передаёт tokenId. Возвращает translation, grammar, baseForm из кэша/БД.",
  })
  @ApiBody({ type: WordLookupDto })
  @ApiOkResponse({
    description: "lemmaId, translation, tranAlt, grammar, baseForm, forms[], tags[], examples[], userStatus, inDictionary, dictionaryEntryId",
  })
  async lookup(@Body() dto: WordLookupDto, @User("id") userId: string | undefined) {
    return this.wordsService.lookup(dto.tokenId, userId);
  }

  @Auth()
  @Get(":lemmaId/examples")
  @ApiOperation({
    summary: "Корпусные примеры употребления слова",
    description:
      "Возвращает до 10 сниппетов из разных текстов базы, где встречается данная лемма. Не зависит от истории пользователя.",
  })
  @ApiParam({ name: "lemmaId", description: "Lemma ID" })
  @ApiOkResponse({ description: "Список сниппетов с указанием источника." })
  async getExamples(@Param("lemmaId") lemmaId: string) {
    return this.wordExamplesService.getExamples(lemmaId);
  }

  @Post("lookup-by-word")
  @Auth()
  @ApiOperation({
    summary: "Получить перевод по строке слова (цепочка на запросе)",
    description:
      "Для введённого пользователем слова. Цепочка: админ → кэш → онлайн → морфология.",
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
}
