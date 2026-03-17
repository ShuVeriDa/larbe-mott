import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
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
import { PermissionCode } from "@prisma/client";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { BulkUpdateTokenDto } from "src/token/dto/bulk-update-token.dto";
import { UpdateTokenDto } from "src/token/dto/update-token.dto";
import { AdminTokenService } from "./admin-tokens.service";

@ApiTags("admin/tokens")
@ApiBearerAuth()
@Controller("admin/tokens")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class AdminTokensController {
  constructor(private readonly adminTokenService: AdminTokenService) {}

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Get(":id")
  @ApiOperation({
    summary: "Get token for admin edit (admin only)",
    description:
      "Returns full token details for editing: original, normalized, position, vocabId, vocabulary. Does not use cache.",
  })
  @ApiParam({ name: "id", description: "Token ID (cuid)" })
  @ApiOkResponse({
    description:
      "Token admin detail: id, original, normalized, position, vocabId, vocabulary.",
  })
  @ApiNotFoundResponse({ description: "Token not found." })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async getTokenForAdmin(@Param("id") tokenId: string) {
    return this.adminTokenService.getTokenForAdmin(tokenId);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Patch("bulk")
  @ApiOperation({
    summary: "Bulk update tokens (admin only)",
    description:
      "Apply multiple token updates in one request. Each item can set original, normalized, vocabId. Returns updated tokens and per-item errors.",
  })
  @ApiOkResponse({
    description: "Object with updated[] and errors[] (tokenId, message).",
  })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  async updateTokensBulk(@Body() dto: BulkUpdateTokenDto) {
    return this.adminTokenService.updateTokensBulk(dto.updates);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
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
  async updateToken(@Param("id") tokenId: string, @Body() dto: UpdateTokenDto) {
    return this.adminTokenService.updateToken(tokenId, dto);
  }
}
