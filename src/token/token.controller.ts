import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Admin } from "src/auth/decorators/admin.decorator";
import { Auth } from "src/auth/decorators/auth.decorator";
import { User } from "src/user/decorators/user.decorator";
import { UpdateTokenDto } from "./dto/update-token.dto";
import { TokenService } from "./token.service";

@ApiTags("tokens")
@ApiBearerAuth()
@Controller("tokens")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class TokenController {
  constructor(private readonly tokenService: TokenService) {}

  @Admin()
  @Get(":id/admin")
  @ApiOperation({
    summary: "Get token for admin edit (admin only)",
    description:
      "Returns full token details for editing: original, normalized, position, vocabId, vocabulary. Does not use cache.",
  })
  @ApiParam({ name: "id", description: "Token ID (cuid)" })
  @ApiOkResponse({
    description: "Token admin detail: id, original, normalized, position, vocabId, vocabulary.",
  })
  @ApiNotFoundResponse({ description: "Token not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async getTokenForAdmin(@Param("id") tokenId: string) {
    return this.tokenService.getTokenForAdmin(tokenId);
  }

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

  @Admin()
  @Patch(":id")
  @ApiOperation({
    summary: "Update single token (admin only)",
    description:
      "Update original, normalized, or vocabId. Does not trigger re-tokenization. Invalidates cache for this token.",
  })
  @ApiParam({ name: "id", description: "Token ID (cuid)" })
  @ApiOkResponse({
    description: "Updated token admin detail.",
  })
  @ApiNotFoundResponse({ description: "Token not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async updateToken(
    @Param("id") tokenId: string,
    @Body() dto: UpdateTokenDto,
  ) {
    return this.tokenService.updateToken(tokenId, dto);
  }
}
