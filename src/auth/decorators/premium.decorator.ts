import { applyDecorators, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiForbiddenResponse } from "@nestjs/swagger";
import { JwtAuthGuard } from "../jwt/jwt.guard";
import { PremiumGuard } from "../guards/premium.guard";

export const RequiresPremium = () =>
  applyDecorators(
    UseGuards(JwtAuthGuard, PremiumGuard),
    ApiBearerAuth(),
    ApiForbiddenResponse({
      description:
        "SUBSCRIPTION_REQUIRED — no Premium subscription, or SUBSCRIPTION_EXPIRED — subscription lapsed",
    }),
  );
