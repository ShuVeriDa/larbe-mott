import { Injectable } from "@nestjs/common";
import { PermissionCode } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { RedisService } from "src/redis/redis.service";

const PERMS_CACHE_TTL = 300;

@Injectable()
export class PermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private permsCacheKey = (userId: string) => `user:perms:${userId}`;

  async invalidatePermissionsCache(userId: string): Promise<void> {
    await this.redis.del(this.permsCacheKey(userId));
  }

  async getUserPermissions(userId: string): Promise<Set<PermissionCode>> {
    const cacheKey = this.permsCacheKey(userId);
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return new Set<PermissionCode>(JSON.parse(cached) as PermissionCode[]);
    }

    const assignments = await this.prisma.userRoleAssignment.findMany({
      where: { userId },
      select: {
        role: {
          select: {
            permissions: {
              select: {
                permission: { select: { code: true } },
              },
            },
          },
        },
      },
    });

    const permissions = new Set<PermissionCode>();
    for (const a of assignments) {
      for (const rp of a.role.permissions) {
        permissions.add(rp.permission.code);
      }
    }

    await this.redis.setex(cacheKey, PERMS_CACHE_TTL, JSON.stringify([...permissions]));

    return permissions;
  }

  async hasPermission(
    userId: string,
    permission: PermissionCode,
  ): Promise<boolean> {
    const perms = await this.getUserPermissions(userId);
    return perms.has(permission);
  }
}

