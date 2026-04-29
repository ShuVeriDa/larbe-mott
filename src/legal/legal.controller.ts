import { Controller, Get, Param, Query } from "@nestjs/common";
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { LegalService } from "./legal.service";

@ApiTags("legal")
@Controller("legal")
export class LegalController {
  constructor(private readonly legalService: LegalService) {}

  @Get(":slug")
  @ApiOperation({
    summary: "Получить опубликованный юридический/информационный документ",
    description:
      "Публичный эндпоинт. Возвращает документ по slug в запрошенном языке. " +
      "Если в этом языке документа нет — фолбэчит на 'ru'. Черновики (isPublished=false) не возвращаются.",
  })
  @ApiParam({
    name: "slug",
    description: "Идентификатор документа",
    example: "privacy",
  })
  @ApiQuery({
    name: "lang",
    required: false,
    description: "Язык: ru | che | en | ar (по умолчанию ru)",
    example: "ru",
  })
  @ApiOkResponse({
    description:
      "{ slug, lang, title, content (Markdown), version, publishedAt, updatedAt }",
  })
  @ApiNotFoundResponse({
    description: "Документ с таким slug не опубликован ни в одном языке",
  })
  async getOne(@Param("slug") slug: string, @Query("lang") lang?: string) {
    return this.legalService.getPublishedBySlug(slug, lang ?? "");
  }
}
