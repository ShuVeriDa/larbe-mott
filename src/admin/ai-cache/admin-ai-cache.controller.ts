import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { AiCacheStatus } from "@prisma/client";
import { PermissionCode } from "@prisma/client";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { User } from "src/user/decorators/user.decorator";
import { AdminAiCacheService } from "./admin-ai-cache.service";

@ApiTags("admin/ai-cache")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
@Controller("admin/ai-cache")
export class AdminAiCacheController {
  constructor(private readonly adminAiCacheService: AdminAiCacheService) {}

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Get("stats")
  @ApiOperation({ summary: "AI translation cache stats" })
  @ApiOkResponse({ description: "{ pending, approvedThisWeek, rejected, topWords }" })
  getStats() {
    return this.adminAiCacheService.getStats();
  }

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Get()
  @ApiOperation({ summary: "List AI cache entries" })
  list(
    @Query("status") status?: AiCacheStatus,
    @Query("q") q?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.adminAiCacheService.list({
      status,
      q,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Post(":id/approve")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Approve an AI cache entry" })
  @ApiParam({ name: "id", description: "AI cache entry UUID" })
  approve(@Param("id", ParseUUIDPipe) id: string) {
    return this.adminAiCacheService.approve(id);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Post(":id/reject")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reject an AI cache entry" })
  @ApiParam({ name: "id", description: "AI cache entry UUID" })
  reject(@Param("id", ParseUUIDPipe) id: string) {
    return this.adminAiCacheService.reject(id);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete an AI cache entry" })
  @ApiParam({ name: "id", description: "AI cache entry UUID" })
  async remove(@Param("id", ParseUUIDPipe) id: string) {
    await this.adminAiCacheService.remove(id);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_DICTIONARY)
  @Post(":id/ai-hint")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Get AI translation hint for an entry using admin Gemini key" })
  @ApiParam({ name: "id", description: "Lemma string to translate" })
  getAiHint(@Param("id") lemma: string, @User("id") userId: string) {
    return this.adminAiCacheService.getAiHint(userId, lemma);
  }
}
