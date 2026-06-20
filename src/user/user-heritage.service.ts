import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { NotificationType, RoleName, VerificationStatus } from "@prisma/client";
import { ErrorCode } from "src/common/errors/error-codes";
import { NOTIFICATION_EVENTS } from "src/notification/notification-events";
import { PrismaService } from "src/prisma.service";
import { UpdateHeritageDto } from "./dto/update-heritage.dto";
import { UpdatePrivacyDto } from "./dto/update-privacy.dto";

const heritageInclude = {
  nation: { select: { id: true, slug: true, name: true } },
  tukhum: { select: { id: true, slug: true, name: true } },
  taip: { select: { id: true, slug: true, name: true, nekyi: true } },
  gara: { select: { id: true, slug: true, name: true, nekyi: true } },
} as const;

@Injectable()
export class UserHeritageService {
  private readonly logger = new Logger(UserHeritageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getMyHeritage(userId: string) {
    const heritage = await this.prisma.userHeritage.findUnique({
      where: { userId },
      include: heritageInclude,
    });

    if (!heritage) {
      return null;
    }

    return heritage;
  }

  async upsertHeritage(userId: string, dto: UpdateHeritageDto) {
    const prevHeritage = await this.prisma.userHeritage.findUnique({
      where: { userId },
      select: { taipCustom: true, garaCustom: true },
    });

    const hadCustomTaip = !!prevHeritage?.taipCustom;
    const hadCustomGara = !!prevHeritage?.garaCustom;
    const hasNewCustomTaip = dto.taipCustom !== undefined && dto.taipCustom !== null && dto.taipCustom !== "";
    const hasNewCustomGara = dto.garaCustom !== undefined && dto.garaCustom !== null && dto.garaCustom !== "";

    // When a director taip is selected, clear custom taip
    const taipIdSelected = dto.taipId !== undefined;
    const garaIdSelected = dto.garaId !== undefined;

    const data = {
      nationId: dto.nationId,
      tukhumId: dto.tukhumId,
      hasTukhum: dto.hasTukhum,
      taipId: taipIdSelected ? dto.taipId : undefined,
      taipCustom: taipIdSelected ? null : (hasNewCustomTaip ? dto.taipCustom : undefined),
      taipStatus: taipIdSelected
        ? null
        : hasNewCustomTaip && !hadCustomTaip
          ? VerificationStatus.PENDING
          : undefined,
      garaId: garaIdSelected ? dto.garaId : undefined,
      garaCustom: garaIdSelected ? null : (hasNewCustomGara ? dto.garaCustom : undefined),
      garaStatus: garaIdSelected
        ? null
        : hasNewCustomGara && !hadCustomGara
          ? VerificationStatus.PENDING
          : undefined,
      nekyi: dto.nekyi,
      otherNationName: dto.otherNationName,
      regionId: dto.regionId,
      districtId: dto.districtId,
      settlementId: dto.settlementId,
    };

    // Strip undefined — Prisma upsert should not overwrite unset fields
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined),
    );

    const heritage = await this.prisma.userHeritage.upsert({
      where: { userId },
      update: cleanData,
      create: { userId, ...cleanData },
      include: heritageInclude,
    });

    // Notify admins when a new custom taip/gara is submitted for moderation
    const newCustomTaip = hasNewCustomTaip && !hadCustomTaip;
    const newCustomGara = hasNewCustomGara && !hadCustomGara;

    if (newCustomTaip || newCustomGara) {
      this.notifyAdmins(NotificationType.HERITAGE_MODERATION, heritage.id).catch(
        (err: unknown) => this.logger.error("Failed to notify admins about heritage moderation", err),
      );
    }

    return heritage;
  }

  async getPublicHeritage(targetUserId: string) {
    const [heritage, privacy] = await Promise.all([
      this.prisma.userHeritage.findUnique({
        where: { userId: targetUserId },
        include: heritageInclude,
      }),
      this.prisma.userPrivacySettings.findUnique({
        where: { userId: targetUserId },
      }),
    ]);

    if (!heritage) return null;

    // If privacy settings not found, use defaults (all public except phone/age)
    const showHeritage = privacy?.showHeritage ?? true;
    const showLocation = privacy?.showLocation ?? true;

    // Return nothing (not null, but absent) when field is private — per plan spec
    const result: Record<string, unknown> = { id: heritage.id };

    if (showHeritage) {
      result.nation = heritage.nation;
      result.tukhum = heritage.tukhum;
      result.taip = heritage.taip;
      result.taipCustom = heritage.taipCustom;
      result.taipStatus = heritage.taipStatus;
      result.gara = heritage.gara;
      result.garaCustom = heritage.garaCustom;
      result.garaStatus = heritage.garaStatus;
      result.nekyi = heritage.nekyi;
      result.otherNationName = heritage.otherNationName;
    }

    if (showLocation) {
      result.regionId = heritage.regionId;
      result.districtId = heritage.districtId;
      result.settlementId = heritage.settlementId;
    }

    return result;
  }

  async getMyPrivacy(userId: string) {
    const privacy = await this.prisma.userPrivacySettings.findUnique({
      where: { userId },
    });

    if (!privacy) {
      // Return defaults — record is created lazily on first PATCH
      return {
        userId,
        showPhone: false,
        showAge: false,
        showHeritage: true,
        showLocation: true,
        showActivity: true,
        showJoinDate: true,
      };
    }

    return privacy;
  }

  async upsertPrivacy(userId: string, dto: UpdatePrivacyDto) {
    // Validate user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException({ code: ErrorCode.USER_NOT_FOUND, message: "User not found" });

    return this.prisma.userPrivacySettings.upsert({
      where: { userId },
      update: dto,
      create: { userId, ...dto },
    });
  }

  private async notifyAdmins(type: NotificationType, entityId: string): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: {
        roles: {
          some: {
            role: { name: { in: [RoleName.ADMIN, RoleName.SUPERADMIN, RoleName.SUPPORT] } },
          },
        },
      },
      select: { id: true },
    });

    for (const admin of admins) {
      this.eventEmitter.emit(NOTIFICATION_EVENTS.CREATE, {
        userId: admin.id,
        type,
        entityId,
      });
    }
  }
}
