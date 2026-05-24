import { Controller, Get, Param, Req } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { Request } from "express";
import { OptionalAuth } from "src/auth/decorators/optional-auth.decorator";
import { User } from "src/user/decorators/user.decorator";
import { TrackingService } from "src/tracking/tracking.service";
import { TokenService } from "./token.service";

@ApiTags("tokens")
@ApiBearerAuth()
@Controller("tokens")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class TokenController {
  constructor(
    private readonly tokenService: TokenService,
    private readonly tracking: TrackingService,
  ) {}

  @OptionalAuth()
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
  async getToken(
    @Param("id") tokenId: string,
    @User("id") userId: string | undefined,
    @Req() req: Request,
  ) {
    const result = await this.tokenService.getTokenInfo(tokenId, userId);

    void this.tracking.track({
      type: "word_click",
      path: req.headers["referer"] ?? undefined,
      ip: extractIp(req),
      userAgent: req.headers["user-agent"],
      userId,
      metadata: {
        tokenId,
        word: (result as Record<string, unknown>)?.word ?? null,
        textId: (result as Record<string, unknown>)?.textId ?? null,
      },
    });

    return result;
  }
}

const extractIp = (req: Request): string => {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0].trim();
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.length > 0) return real;
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
};
