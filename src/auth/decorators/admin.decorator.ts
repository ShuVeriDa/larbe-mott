import { UseGuards } from "@nestjs/common";
import { AdminGuard } from "../guards/admin.guard";
import { JwtAuthGuard } from "../jwt/jwt.guard";

export const Admin = () => UseGuards(JwtAuthGuard, AdminGuard);
