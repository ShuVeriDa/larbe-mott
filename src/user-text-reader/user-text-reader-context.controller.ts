import { Controller, Get, ParseIntPipe, ParseUUIDPipe, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { ChScript } from "@prisma/client";
import { Auth } from "src/auth/decorators/auth.decorator";
import { TextScriptService } from "src/text-script/text-script.service";
import { User } from "src/user/decorators/user.decorator";
import { UserTextReaderContextService } from "./user-text-reader-context.service";

@ApiTags("user-text-reader")
@Controller("user-text-reader-context")
export class UserTextReaderContextController {
  constructor(
    private readonly service: UserTextReaderContextService,
    private readonly textScript: TextScriptService,
  ) {}

  @Get()
  @Auth()
  @ApiBearerAuth()
  @ApiOperation({ summary: "Reader context for a private UserText page (owner only)" })
  @ApiQuery({ name: "userTextId", type: String })
  @ApiQuery({ name: "pageNumber", type: Number })
  @ApiQuery({ name: "script", enum: ChScript, required: false, description: "Return transliterated contentRich (LATIN or ARABIC)." })
  @ApiResponse({ status: 200, description: "Page data + highlights + notes" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  @ApiResponse({ status: 404, description: "UserText not found or page out of range" })
  async getContext(
    @User("id") userId: string,
    @Query("userTextId", ParseUUIDPipe) userTextId: string,
    @Query("pageNumber", ParseIntPipe) pageNumber: number,
    @Query("script") script?: ChScript,
  ) {
    const context = await this.service.getContext(userId, userTextId, pageNumber);
    if (script) {
      const scriptPage = await this.textScript.getUserTextPageWithScript(userTextId, userId, pageNumber, script);
      if (scriptPage && context.page) {
        return { ...context, page: { ...context.page, contentRich: scriptPage.contentRich } };
      }
    }
    return context;
  }
}
