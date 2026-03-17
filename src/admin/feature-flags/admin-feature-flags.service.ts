import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { CreateFeatureFlagDto } from "./dto/create-feature-flag.dto";
import { UpdateFeatureFlagDto } from "./dto/update-feature-flag.dto";

@Injectable()
export class AdminFeatureFlagsService {
  constructor(private readonly prisma: PrismaService) {}

  getFlags() {
    return this.prisma.featureFlag.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        userOverrides: {
          select: { userId: true, isEnabled: true },
        },
      },
    });
  }

  createFlag(dto: CreateFeatureFlagDto) {
    return this.prisma.featureFlag.create({
      data: {
        key: dto.key,
        description: dto.description ?? null,
        isEnabled: dto.isEnabled ?? false,
      },
    });
  }

  updateFlag(id: string, dto: UpdateFeatureFlagDto) {
    return this.prisma.featureFlag.update({
      where: { id },
      data: {
        ...(dto.key !== undefined && { key: dto.key }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isEnabled !== undefined && { isEnabled: dto.isEnabled }),
      },
    });
  }

  async setUserOverride(flagId: string, userId: string, isEnabled: boolean) {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { id: flagId },
      select: { id: true },
    });
    if (!flag) throw new NotFoundException("Feature flag not found");

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException("User not found");

    return this.prisma.userFeatureFlag.upsert({
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
      },
      update: { isEnabled },
    });
  }

  async deleteUserOverride(flagId: string, userId: string) {
    try {
      await this.prisma.userFeatureFlag.delete({
        where: {
          userId_featureFlagId: {
            userId,
            featureFlagId: flagId,
          },
        },
      });
      return true;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2025"
      ) {
        throw new BadRequestException("Override does not exist");
      }
      throw e;
    }
  }
}

