import { Controller, Get, Param } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Auth } from "src/auth/decorators/auth.decorator";
import { User } from "src/user/decorators/user.decorator";
import { TokenService } from "./token.service";

@ApiTags("tokens")
@ApiBearerAuth()
@Controller("tokens")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class TokenController {
  constructor(private readonly tokenService: TokenService) {}

  @Auth()
  @Get(":id")
  @ApiOperation({
    summary: "Get token info by ID",
    description:
      "Returns translation, grammar, and base form for the token. Used for word lookup by token identifier.",
  })
  @ApiParam({ name: "id", description: "Token ID (cuid)" })
  @ApiOkResponse({
    description: "Token info: translation, grammar, baseForm.",
  })
  @ApiNotFoundResponse({ description: "Token not found or not accessible." })
  async getToken(@Param("id") tokenId: string, @User("id") userId: string) {
    return this.tokenService.getTokenInfo(tokenId, userId);
  }
}
