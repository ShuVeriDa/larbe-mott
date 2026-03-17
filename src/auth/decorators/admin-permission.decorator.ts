import { applyDecorators, UseGuards } from "@nestjs/common";
import { PermissionCode } from "@prisma/client";
import { JwtAuthGuard } from "../jwt/jwt.guard";
import { RequirePermission } from "../permissions/permission.decorator";
import { PermissionGuard } from "../permissions/permission.guard";

export const AdminPermission = (permission: PermissionCode) =>
  applyDecorators(
    UseGuards(JwtAuthGuard, PermissionGuard),
    RequirePermission(permission),
  );

