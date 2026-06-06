import { Controller, Get, ParseIntPipe, ParseUUIDPipe, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Auth } from "src/auth/decorators/auth.decorator";
import { User } from "src/user/decorators/user.decorator";
import { UserTextReaderContextService } from "./user-text-reader-context.service";

@ApiTags("user-text-reader")
@Controller("user-text-reader-context")
export class UserTextReaderContextController {
  constructor(private readonly service: UserTextReaderContextService) {}

  @Get()
  @Auth()
  @ApiBearerAuth()
  @ApiOperation({ summary: "Reader context for a private UserText page (owner only)" })
  @ApiQuery({ name: "userTextId", type: String })
  @ApiQuery({ name: "pageNumber", type: Number })
  @ApiResponse({ status: 200, description: "Page data + highlights + notes" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  @ApiResponse({ status: 404, description: "UserText not found or page out of range" })
  getContext(
    @User("id") userId: string,
    @Query("userTextId", ParseUUIDPipe) userTextId: string,
    @Query("pageNumber", ParseIntPipe) pageNumber: number,
  ) {
    return this.service.getContext(userId, userTextId, pageNumber);
  }
}
