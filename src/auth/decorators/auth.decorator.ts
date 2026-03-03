import { UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../jwt/jwt.guard";

export const Auth = () => UseGuards(JwtAuthGuard);
