import { UseGuards } from "@nestjs/common";
import { OptionalJwtAuthGuard } from "../jwt/optional-jwt.guard";

export const OptionalAuth = () => UseGuards(OptionalJwtAuthGuard);
