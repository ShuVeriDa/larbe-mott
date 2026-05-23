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
    summary: "Get a published legal/informational document",
    description:
      "Public endpoint. Returns the document by slug in the requested language. " +
      "Falls back to 'ru' if the document is not available in the requested language. Drafts (isPublished=false) are not returned.",
  })
  @ApiParam({
    name: "slug",
    description: "Document identifier",
    example: "privacy",
  })
  @ApiQuery({
    name: "lang",
    required: false,
    description: "Language: ru | che | en | ar (default: ru)",
    example: "ru",
  })
  @ApiOkResponse({
    description:
      "{ slug, lang, title, content (Markdown), version, publishedAt, updatedAt }",
  })
  @ApiNotFoundResponse({
    description: "No document with this slug is published in any language",
  })
  async getOne(@Param("slug") slug: string, @Query("lang") lang?: string) {
    return this.legalService.getPublishedBySlug(slug, lang ?? "");
  }
}
