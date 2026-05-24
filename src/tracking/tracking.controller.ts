import { Body, Controller, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import type { User as UserPrisma } from "@prisma/client";
import { OptionalJwtAuthGuard } from "src/auth/jwt/optional-jwt.guard";
import { TrackingService } from "./tracking.service";
import { TrackEventDto } from "./dto/track-event.dto";

type MaybeAuthRequest = Request & { user?: UserPrisma };

@ApiTags("tracking")
@Controller("tracking")
@UseGuards(OptionalJwtAuthGuard)
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Post("track")
  @HttpCode(204)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: "Track a site-analytics event (pageview or custom)" })
  async track(
    @Body() dto: TrackEventDto,
    @Req() req: MaybeAuthRequest,
  ): Promise<void> {
    await this.tracking.track({
      type: dto.type,
      path: dto.path,
      referrer: dto.referrer,
      metadata: dto.metadata,
      ip: extractIp(req),
      userAgent: req.headers["user-agent"],
      userId: req.user?.id,
    });
  }
}

const extractIp = (req: Request): string => {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.length > 0) return real;
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
};
