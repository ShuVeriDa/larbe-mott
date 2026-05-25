import { Controller, Get, ParseIntPipe, ParseUUIDPipe, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Auth } from "src/auth/decorators/auth.decorator";
import { User } from "src/user/decorators/user.decorator";
import { ReaderContextService } from "./reader-context.service";

@ApiTags("reader-context")
@ApiBearerAuth()
@Controller("reader-context")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class ReaderContextController {
  constructor(private readonly readerContextService: ReaderContextService) {}

  @Auth()
  @Get()
  @ApiOperation({
    summary: "Get full reader page context in one request",
    description:
      "Returns page content (with tokens), phrases, highlights and notes for a given page. " +
      "Replaces four separate API calls made on every reader page load.",
  })
  @ApiQuery({ name: "textId", type: String })
  @ApiQuery({ name: "pageNumber", type: Number })
  @ApiOkResponse({
    description: "{ page, phrases, highlights, notes }",
  })
  async getContext(
    @User("id") userId: string,
    @Query("textId", ParseUUIDPipe) textId: string,
    @Query("pageNumber", ParseIntPipe) pageNumber: number,
  ) {
    return this.readerContextService.getContext(userId, textId, pageNumber);
  }
}
