import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  FeatureFlagCategory,
  FeatureFlagEnvironment,
  FeatureFlagHistoryEventType,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { CreateFeatureFlagDto } from "./dto/create-feature-flag.dto";
import {
  FetchFeatureFlagsDto,
  FeatureFlagStatusFilter,
} from "./dto/fetch-feature-flags.dto";
import { FetchFeatureFlagOverridesDto } from "./dto/fetch-feature-flag-overrides.dto";
import { FetchFeatureFlagHistoryDto } from "./dto/fetch-feature-flag-history.dto";
import {
  ImportFeatureFlagsDto,
  ImportFeatureFlagsMode,
} from "./dto/import-feature-flags.dto";
import { UpdateFeatureFlagDto } from "./dto/update-feature-flag.dto";

type Tx = Prisma.TransactionClient;

@Injectable()
export class AdminFeatureFlagsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const [totalFlags, enabledGlobalCount, overridesCount, prodOnlyCount] =
      await this.prisma.$transaction([
        this.prisma.featureFlag.count({ where: { deletedAt: null } }),
        this.prisma.featureFlag.count({ where: { deletedAt: null, isEnabled: true } }),
        this.prisma.userFeatureFlag.count({
          where: { featureFlag: { deletedAt: null } },
        }),
        this.prisma.featureFlag.count({
          where: {
            deletedAt: null,
            environments: { equals: [FeatureFlagEnvironment.PROD] },
          },
        }),
      ]);

    const overridesUsersCount = await this.prisma.userFeatureFlag.groupBy({
      by: ["userId"],
      where: { featureFlag: { deletedAt: null } },
    });

    return {
      totalFlags,
      enabledGlobalCount,
      enabledGlobalPercent: totalFlags > 0 ? Math.round((enabledGlobalCount / totalFlags) * 100) : 0,
      overridesCount,
      overridesUsersCount: overridesUsersCount.length,
      prodOnlyCount,
    };
  }

  async getFlags(query: FetchFeatureFlagsDto = {}) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    const skip = (page - 1) * limit;

    const where: Prisma.FeatureFlagWhereInput = { deletedAt: null };
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { key: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }
    if (query.category) {
      where.category = query.category;
    }
    if (query.environment) {
      where.environments = { has: query.environment };
    }
    if (query.status === FeatureFlagStatusFilter.ENABLED) {
      where.isEnabled = true;
    }
    if (query.status === FeatureFlagStatusFilter.DISABLED) {
      where.isEnabled = false;
    }

    const [items, total] = await Promise.all([
      this.prisma.featureFlag.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ category: "asc" }, { key: "asc" }],
        include: {
          _count: { select: { userOverrides: true } },
          updatedBy: {
            select: { id: true, email: true, name: true, surname: true },
          },
        },
      }),
      this.prisma.featureFlag.count({ where }),
    ]);

    return {
      items: items.map((flag) => ({
        id: flag.id,
        key: flag.key,
        description: flag.description,
        category: flag.category,
        isEnabled: flag.isEnabled,
        environments: flag.environments,
        rolloutPercent: flag.rolloutPercent,
        overridesCount: flag._count.userOverrides,
        updatedAt: flag.updatedAt,
        updatedBy: flag.updatedBy,
      })),
      total,
      page,
      limit,
      skip,
    };
  }

  async getHistory(query: FetchFeatureFlagHistoryDto = {}) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    const skip = (page - 1) * limit;

    const where: Prisma.FeatureFlagHistoryWhereInput = {};
    if (query.eventType) where.eventType = query.eventType;
    if (query.actorId) where.actorId = query.actorId;
    if (query.flagId) where.flagId = query.flagId;
    if (query.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { flagKey: { contains: q, mode: "insensitive" } },
        { actor: { email: { contains: q, mode: "insensitive" } } },
        { actor: { name: { contains: q, mode: "insensitive" } } },
        { actor: { surname: { contains: q, mode: "insensitive" } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.featureFlagHistory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          actor: { select: { id: true, email: true, name: true, surname: true } },
        },
      }),
      this.prisma.featureFlagHistory.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      skip,
    };
  }

  async getFlagHistory(flagId: string, limit = 20) {
    await this.assertFlagExists(flagId);
    return this.prisma.featureFlagHistory.findMany({
      where: { flagId },
      orderBy: { createdAt: "desc" },
      take: Math.min(100, Math.max(1, limit)),
      include: {
        actor: { select: { id: true, email: true, name: true, surname: true } },
      },
    });
  }

  async createFlag(dto: CreateFeatureFlagDto, actorId?: string) {
    const existing = await this.prisma.featureFlag.findUnique({ where: { key: dto.key } });
    if (existing) throw new ConflictException(`Feature flag "${dto.key}" already exists`);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.featureFlag.create({
        data: {
          key: dto.key,
          description: dto.description ?? null,
          isEnabled: dto.isEnabled ?? false,
          category: dto.category ?? FeatureFlagCategory.FUNCTIONAL,
          environments: dto.environments ?? [
            FeatureFlagEnvironment.PROD,
            FeatureFlagEnvironment.STAGE,
            FeatureFlagEnvironment.DEV,
          ],
          rolloutPercent: dto.rolloutPercent ?? 100,
          createdById: actorId ?? null,
          updatedById: actorId ?? null,
        },
      });

      await this.createHistory(tx, {
        flagId: created.id,
        flagKey: created.key,
        eventType: FeatureFlagHistoryEventType.FLAG_CREATED,
        actorId,
        details: {
          description: created.description,
          category: created.category,
          environments: created.environments,
          rolloutPercent: created.rolloutPercent,
          isEnabled: created.isEnabled,
        },
      });

      return created;
    });
  }

  async updateFlag(id: string, dto: UpdateFeatureFlagDto, actorId?: string) {
    const flag = await this.prisma.featureFlag.findUnique({ where: { id } });
    if (!flag || flag.deletedAt) throw new NotFoundException("Feature flag not found");

    if (dto.key && dto.key !== flag.key) {
      const duplicate = await this.prisma.featureFlag.findFirst({
        where: { key: dto.key, id: { not: id } },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException(`Feature flag "${dto.key}" already exists`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.featureFlag.update({
        where: { id },
        data: {
          ...(dto.key !== undefined && { key: dto.key }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.isEnabled !== undefined && { isEnabled: dto.isEnabled }),
          ...(dto.category !== undefined && { category: dto.category }),
          ...(dto.environments !== undefined && { environments: dto.environments }),
          ...(dto.rolloutPercent !== undefined && { rolloutPercent: dto.rolloutPercent }),
          updatedById: actorId ?? null,
        },
      });

      const details: Record<string, Prisma.InputJsonValue> = {};
      if (dto.key !== undefined && dto.key !== flag.key) details["key"] = { from: flag.key, to: dto.key };
      if (dto.description !== undefined && dto.description !== flag.description) {
        details["description"] = { from: flag.description, to: dto.description };
      }
      if (dto.isEnabled !== undefined && dto.isEnabled !== flag.isEnabled) {
        details["isEnabled"] = { from: flag.isEnabled, to: dto.isEnabled };
      }
      if (dto.category !== undefined && dto.category !== flag.category) {
        details["category"] = { from: flag.category, to: dto.category };
      }
      if (
        dto.environments !== undefined &&
        JSON.stringify(dto.environments) !== JSON.stringify(flag.environments)
      ) {
        details["environments"] = { from: flag.environments, to: dto.environments };
      }
      if (dto.rolloutPercent !== undefined && dto.rolloutPercent !== flag.rolloutPercent) {
        details["rolloutPercent"] = { from: flag.rolloutPercent, to: dto.rolloutPercent };
      }

      if (Object.keys(details).length > 0) {
        await this.createHistory(tx, {
          flagId: updated.id,
          flagKey: updated.key,
          eventType: FeatureFlagHistoryEventType.FLAG_UPDATED,
          actorId,
          details,
        });
      }

      return updated;
    });
  }

  async toggleFlag(id: string, isEnabled: boolean, actorId?: string) {
    const flag = await this.prisma.featureFlag.findUnique({ where: { id } });
    if (!flag || flag.deletedAt) throw new NotFoundException("Feature flag not found");
    if (flag.isEnabled === isEnabled) return flag;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.featureFlag.update({
        where: { id },
        data: { isEnabled, updatedById: actorId ?? null },
      });
      await this.createHistory(tx, {
        flagId: updated.id,
        flagKey: updated.key,
        eventType: isEnabled
          ? FeatureFlagHistoryEventType.GLOBAL_ENABLED
          : FeatureFlagHistoryEventType.GLOBAL_DISABLED,
        actorId,
        details: { from: flag.isEnabled, to: isEnabled },
      });
      return updated;
    });
  }

  async deleteFlag(id: string, actorId?: string) {
    const flag = await this.prisma.featureFlag.findUnique({ where: { id } });
    if (!flag || flag.deletedAt) throw new NotFoundException("Feature flag not found");

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.featureFlag.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          updatedById: actorId ?? null,
        },
      });
      await this.createHistory(tx, {
        flagId: deleted.id,
        flagKey: deleted.key,
        eventType: FeatureFlagHistoryEventType.FLAG_DELETED,
        actorId,
      });
      return true;
    });
  }

  async duplicateFlag(id: string, newKey: string, actorId?: string) {
    const source = await this.prisma.featureFlag.findUnique({ where: { id } });
    if (!source || source.deletedAt) throw new NotFoundException("Feature flag not found");
    const existing = await this.prisma.featureFlag.findUnique({ where: { key: newKey } });
    if (existing) throw new ConflictException(`Feature flag "${newKey}" already exists`);

    return this.prisma.$transaction(async (tx) => {
      const duplicated = await tx.featureFlag.create({
        data: {
          key: newKey,
          description: source.description,
          isEnabled: source.isEnabled,
          category: source.category,
          environments: source.environments,
          rolloutPercent: source.rolloutPercent,
          createdById: actorId ?? null,
          updatedById: actorId ?? null,
        },
      });
      await this.createHistory(tx, {
        flagId: duplicated.id,
        flagKey: duplicated.key,
        eventType: FeatureFlagHistoryEventType.FLAG_DUPLICATED,
        actorId,
        details: { sourceFlagId: source.id, sourceKey: source.key },
      });
      return duplicated;
    });
  }

  async importFlags(dto: ImportFeatureFlagsDto, actorId?: string) {
    const now = new Date();
    const normalized = dto.items.map((item) => ({
      key: item.key,
      description: item.description ?? null,
      isEnabled: item.isEnabled ?? false,
      category: item.category ?? FeatureFlagCategory.FUNCTIONAL,
      environments: item.environments ?? [
        FeatureFlagEnvironment.PROD,
        FeatureFlagEnvironment.STAGE,
        FeatureFlagEnvironment.DEV,
      ],
      rolloutPercent: item.rolloutPercent ?? 100,
    }));

    if (dto.dryRun) {
      const keys = normalized.map((item) => item.key);
      const existing = await this.prisma.featureFlag.findMany({
        where: { key: { in: keys } },
        select: { key: true },
      });
      const existingSet = new Set(existing.map((item) => item.key));
      return {
        dryRun: true,
        mode: dto.mode ?? ImportFeatureFlagsMode.UPSERT,
        processed: normalized.length,
        wouldCreate: normalized.filter((item) => !existingSet.has(item.key)).length,
        wouldUpdate: normalized.filter((item) => existingSet.has(item.key)).length,
      };
    }

    return this.prisma.$transaction(async (tx) => {
      let created = 0;
      let updated = 0;
      let skipped = 0;
      const mode = dto.mode ?? ImportFeatureFlagsMode.UPSERT;

      for (const item of normalized) {
        const existing = await tx.featureFlag.findUnique({ where: { key: item.key } });
        if (!existing) {
          await tx.featureFlag.create({
            data: {
              key: item.key,
              description: item.description,
              isEnabled: item.isEnabled,
              category: item.category,
              environments: item.environments,
              rolloutPercent: item.rolloutPercent,
              createdById: actorId ?? null,
              updatedById: actorId ?? null,
              createdAt: now,
            },
          });
          created += 1;
          continue;
        }

        if (mode === ImportFeatureFlagsMode.CREATE_ONLY) {
          skipped += 1;
          continue;
        }

        await tx.featureFlag.update({
          where: { id: existing.id },
          data: {
            description: item.description,
            isEnabled: item.isEnabled,
            category: item.category,
            environments: item.environments,
            rolloutPercent: item.rolloutPercent,
            deletedAt: null,
            updatedById: actorId ?? null,
          },
        });
        updated += 1;
      }

      await this.createHistory(tx, {
        flagId: null,
        flagKey: "__import__",
        eventType: FeatureFlagHistoryEventType.FLAGS_IMPORTED,
        actorId,
        details: { mode, created, updated, skipped, processed: normalized.length },
      });

      return {
        dryRun: false,
        mode,
        processed: normalized.length,
        created,
        updated,
        skipped,
      };
    });
  }

  async getOverrides(query: FetchFeatureFlagOverridesDto = {}) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    const skip = (page - 1) * limit;

    const where: Prisma.UserFeatureFlagWhereInput = {
      featureFlag: { deletedAt: null },
    };
    if (query.flagId) {
      where.featureFlagId = query.flagId;
    }
    const isEnabledFilter = this.normalizeBooleanQuery(query.isEnabled);
    if (isEnabledFilter !== undefined) {
      where.isEnabled = isEnabledFilter;
    }
    if (query.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { featureFlag: { key: { contains: q, mode: "insensitive" } } },
        { user: { email: { contains: q, mode: "insensitive" } } },
        { user: { name: { contains: q, mode: "insensitive" } } },
        { user: { surname: { contains: q, mode: "insensitive" } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.userFeatureFlag.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: "desc" },
        include: {
          user: { select: { id: true, email: true, name: true, surname: true } },
          featureFlag: {
            select: {
              id: true,
              key: true,
              isEnabled: true,
              rolloutPercent: true,
              environments: true,
            },
          },
          setBy: { select: { id: true, email: true, name: true, surname: true } },
        },
      }),
      this.prisma.userFeatureFlag.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      skip,
    };
  }

  async createOverride(dto: {
    flagId: string;
    userIdOrEmail: string;
    isEnabled: boolean;
    reason?: string;
  }, actorId?: string) {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { id: dto.flagId },
      select: { id: true, key: true, deletedAt: true },
    });
    if (!flag || flag.deletedAt) throw new NotFoundException("Feature flag not found");

    const user = await this.findUserByIdOrEmail(dto.userIdOrEmail);
    if (!user) throw new NotFoundException("User not found");

    return this.setUserOverride(flag.id, user.id, dto.isEnabled, dto.reason, actorId);
  }

  async setUserOverride(
    flagId: string,
    userId: string,
    isEnabled: boolean,
    reason?: string,
    actorId?: string,
  ) {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { id: flagId },
      select: { id: true, key: true, deletedAt: true },
    });
    if (!flag || flag.deletedAt) throw new NotFoundException("Feature flag not found");

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException("User not found");

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.userFeatureFlag.findUnique({
        where: {
          userId_featureFlagId: {
            userId,
            featureFlagId: flagId,
          },
        },
        select: { isEnabled: true },
      });

      const override = await tx.userFeatureFlag.upsert({
        where: {
          userId_featureFlagId: {
            userId,
            featureFlagId: flagId,
          },
        },
        create: {
          userId,
          featureFlagId: flagId,
          isEnabled,
          reason: reason ?? null,
          setById: actorId ?? null,
        },
        update: {
          isEnabled,
          reason: reason ?? null,
          setById: actorId ?? null,
        },
      });

      await this.createHistory(tx, {
        flagId,
        flagKey: flag.key,
        eventType: existing
          ? FeatureFlagHistoryEventType.OVERRIDE_UPDATED
          : FeatureFlagHistoryEventType.OVERRIDE_ADDED,
        actorId,
        details: {
          userId,
          from: existing?.isEnabled ?? null,
          to: isEnabled,
          reason: reason ?? null,
        },
      });

      return override;
    });
  }

  async deleteOverride(overrideId: string, actorId?: string) {
    const override = await this.prisma.userFeatureFlag.findUnique({
      where: { id: overrideId },
      include: { featureFlag: { select: { id: true, key: true } } },
    });
    if (!override) throw new NotFoundException("Override does not exist");

    return this.prisma.$transaction(async (tx) => {
      await tx.userFeatureFlag.delete({ where: { id: overrideId } });
      await this.createHistory(tx, {
        flagId: override.featureFlag.id,
        flagKey: override.featureFlag.key,
        eventType: FeatureFlagHistoryEventType.OVERRIDE_REMOVED,
        actorId,
        details: {
          userId: override.userId,
          removedValue: override.isEnabled,
        },
      });
      return true;
    });
  }

  async deleteUserOverride(flagId: string, userId: string, actorId?: string) {
    const override = await this.prisma.userFeatureFlag.findUnique({
      where: {
        userId_featureFlagId: {
          userId,
          featureFlagId: flagId,
        },
      },
      include: { featureFlag: { select: { id: true, key: true } } },
    });
    if (!override) {
      throw new NotFoundException("Override does not exist");
    }

    try {
      return this.prisma.$transaction(async (tx) => {
        await tx.userFeatureFlag.delete({
          where: {
            userId_featureFlagId: {
              userId,
              featureFlagId: flagId,
            },
          },
        });
        await this.createHistory(tx, {
          flagId: override.featureFlag.id,
          flagKey: override.featureFlag.key,
          eventType: FeatureFlagHistoryEventType.OVERRIDE_REMOVED,
          actorId,
          details: {
            userId: override.userId,
            removedValue: override.isEnabled,
          },
        });
        return true;
      });
    } catch (e: unknown) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2025"
      ) {
        throw new NotFoundException("Override does not exist");
      }
      throw e;
    }
  }

  private async assertFlagExists(flagId: string) {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { id: flagId },
      select: { id: true, deletedAt: true },
    });
    if (!flag || flag.deletedAt) {
      throw new NotFoundException("Feature flag not found");
    }
  }

  private async createHistory(
    tx: Tx,
    payload: {
      flagId: string | null;
      flagKey: string;
      eventType: FeatureFlagHistoryEventType;
      actorId?: string;
      details?: Prisma.InputJsonValue;
    },
  ) {
    await tx.featureFlagHistory.create({
      data: {
        flagId: payload.flagId,
        flagKey: payload.flagKey,
        eventType: payload.eventType,
        actorId: payload.actorId ?? null,
        details: payload.details ?? Prisma.JsonNull,
      },
    });
  }

  private async findUserByIdOrEmail(value: string) {
    const normalized = value.trim();
    if (!normalized) return null;
    if (normalized.includes("@")) {
      return this.prisma.user.findFirst({
        where: { email: { equals: normalized, mode: "insensitive" } },
        select: { id: true },
      });
    }
    return this.prisma.user.findUnique({
      where: { id: normalized },
      select: { id: true },
    });
  }

  private normalizeBooleanQuery(value: unknown): boolean | undefined {
    if (typeof value === "boolean") return value;
    if (typeof value !== "string") return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "on") return true;
    if (normalized === "false" || normalized === "0" || normalized === "off") return false;
    throw new BadRequestException("isEnabled filter must be true/false (or on/off)");
  }
}

