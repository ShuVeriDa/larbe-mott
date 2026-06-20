import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { NotificationType, Prisma, VerificationStatus } from "@prisma/client";
import { ErrorCode } from "src/common/errors/error-codes";
import { NOTIFICATION_EVENTS } from "src/notification/notification-events";
import { PrismaService } from "src/prisma.service";
import {
  CreateGaraDto,
  CreateNationDto,
  CreateTaipDto,
  CreateTukhumDto,
  UpdateGaraDto,
  UpdateNationDto,
  UpdateTaipDto,
  UpdateTukhumDto,
} from "./dto/upsert-heritage-entry.dto";
import { FetchPendingHeritageDto, PendingHeritageType } from "./dto/fetch-pending-heritage.dto";
import { HeritageReviewAction, ReviewHeritageTaipDto } from "./dto/review-heritage-taip.dto";
import { ReviewHeritageGaraDto } from "./dto/review-heritage-gara.dto";

@Injectable()
export class AdminHeritageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Stats ───────────────────────────────────────────────────────────────────

  async getStats() {
    const [taipPending, taipApproved, taipRejected, garaPending, garaApproved, garaRejected] =
      await Promise.all([
        this.prisma.userHeritage.count({ where: { taipStatus: VerificationStatus.PENDING } }),
        this.prisma.userHeritage.count({ where: { taipStatus: VerificationStatus.APPROVED } }),
        this.prisma.userHeritage.count({ where: { taipStatus: VerificationStatus.REJECTED } }),
        this.prisma.userHeritage.count({ where: { garaStatus: VerificationStatus.PENDING } }),
        this.prisma.userHeritage.count({ where: { garaStatus: VerificationStatus.APPROVED } }),
        this.prisma.userHeritage.count({ where: { garaStatus: VerificationStatus.REJECTED } }),
      ]);

    return {
      taip: { pending: taipPending, approved: taipApproved, rejected: taipRejected },
      gara: { pending: garaPending, approved: garaApproved, rejected: garaRejected },
      totalPending: taipPending + garaPending,
    };
  }

  // ─── Moderation: list pending ────────────────────────────────────────────────

  async getPendingSubmissions(dto: FetchPendingHeritageDto) {
    const page = Math.max(1, dto.page ?? 1);
    const limit = Math.min(100, Math.max(1, dto.limit ?? 20));
    const skip = (page - 1) * limit;

    const typeFilter = dto.type;

    const where = typeFilter === PendingHeritageType.TAIP
      ? { taipStatus: VerificationStatus.PENDING }
      : typeFilter === PendingHeritageType.GARA
        ? { garaStatus: VerificationStatus.PENDING }
        : {
            OR: [
              { taipStatus: VerificationStatus.PENDING },
              { garaStatus: VerificationStatus.PENDING },
            ],
          };

    const [items, total] = await Promise.all([
      this.prisma.userHeritage.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          taipCustom: true,
          taipStatus: true,
          garaCustom: true,
          garaStatus: true,
          updatedAt: true,
          user: {
            select: { id: true, username: true, name: true, surname: true },
          },
          tukhum: { select: { id: true, slug: true, name: true } },
          taip: { select: { id: true, slug: true, name: true } },
          nation: { select: { id: true, slug: true, name: true } },
        },
      }),
      this.prisma.userHeritage.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  // ─── Moderation: review taip ─────────────────────────────────────────────────

  async reviewTaip(heritageId: string, dto: ReviewHeritageTaipDto) {
    const heritage = await this.prisma.userHeritage.findUnique({
      where: { id: heritageId },
      select: {
        id: true,
        userId: true,
        taipCustom: true,
        taipStatus: true,
        tukhumId: true,
        nationId: true,
      },
    });

    if (!heritage) {
      throw new NotFoundException({
        code: ErrorCode.HERITAGE_NOT_FOUND,
        message: `UserHeritage #${heritageId} not found`,
      });
    }

    if (!heritage.taipCustom) {
      throw new BadRequestException({
        code: ErrorCode.HERITAGE_TAIP_NO_CUSTOM,
        message: "This heritage record has no custom taip to review",
      });
    }

    if (heritage.taipStatus !== VerificationStatus.PENDING) {
      throw new BadRequestException({
        code: ErrorCode.HERITAGE_TAIP_ALREADY_REVIEWED,
        message: "Taip has already been reviewed",
      });
    }

    const newStatus =
      dto.action === HeritageReviewAction.VERIFY
        ? VerificationStatus.APPROVED
        : VerificationStatus.REJECTED;

    if (dto.action === HeritageReviewAction.VERIFY && dto.addToDirectory) {
      await this.verifyAndAddTaipToDirectory(heritageId, heritage, dto);
    } else {
      await this.prisma.userHeritage.update({
        where: { id: heritageId },
        data: { taipStatus: newStatus },
      });
    }

    this.eventEmitter.emit(NOTIFICATION_EVENTS.CREATE, {
      userId: heritage.userId,
      type: NotificationType.HERITAGE_MODERATION,
      entityId: heritageId,
    });

    return { success: true, status: newStatus };
  }

  private async verifyAndAddTaipToDirectory(
    heritageId: string,
    heritage: {
      userId: string;
      taipCustom: string | null;
      tukhumId: string | null;
      nationId: string | null;
    },
    dto: ReviewHeritageTaipDto,
  ) {
    const resolvedNationId = dto.nationId ?? heritage.nationId;
    const resolvedTukhumId = dto.tukhumId ?? heritage.tukhumId ?? null;

    if (!resolvedNationId) {
      throw new BadRequestException({
        code: ErrorCode.HERITAGE_NATION_NOT_FOUND,
        message: "nationId is required to add taip to directory",
      });
    }

    const customName = heritage.taipCustom!.trim();
    const slug = this.toSlug(customName);

    const existingTaip = await this.prisma.taip.findUnique({ where: { slug } });
    if (existingTaip) {
      throw new ConflictException({
        code: ErrorCode.HERITAGE_TAIP_SLUG_TAKEN,
        message: `Taip with slug "${slug}" already exists`,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const newTaip = await tx.taip.create({
        data: {
          slug,
          name: { che: customName, ru: customName, en: customName } as unknown as Prisma.InputJsonValue,
          nekyi: [],
          nationId: resolvedNationId,
          tukhumId: resolvedTukhumId,
          status: VerificationStatus.APPROVED,
          submittedById: heritage.userId,
        },
      });

      await tx.userHeritage.update({
        where: { id: heritageId },
        data: {
          taipStatus: VerificationStatus.APPROVED,
          taipId: newTaip.id,
          taipCustom: null,
        },
      });
    });
  }

  // ─── Moderation: review gara ─────────────────────────────────────────────────

  async reviewGara(heritageId: string, dto: ReviewHeritageGaraDto) {
    const heritage = await this.prisma.userHeritage.findUnique({
      where: { id: heritageId },
      select: {
        id: true,
        userId: true,
        garaCustom: true,
        garaStatus: true,
        taipId: true,
      },
    });

    if (!heritage) {
      throw new NotFoundException({
        code: ErrorCode.HERITAGE_NOT_FOUND,
        message: `UserHeritage #${heritageId} not found`,
      });
    }

    if (!heritage.garaCustom) {
      throw new BadRequestException({
        code: ErrorCode.HERITAGE_GARA_NO_CUSTOM,
        message: "This heritage record has no custom gara to review",
      });
    }

    if (heritage.garaStatus !== VerificationStatus.PENDING) {
      throw new BadRequestException({
        code: ErrorCode.HERITAGE_GARA_ALREADY_REVIEWED,
        message: "Gara has already been reviewed",
      });
    }

    const newStatus =
      dto.action === HeritageReviewAction.VERIFY
        ? VerificationStatus.APPROVED
        : VerificationStatus.REJECTED;

    if (dto.action === HeritageReviewAction.VERIFY && dto.addToDirectory) {
      await this.verifyAndAddGaraToDirectory(heritageId, heritage, dto);
    } else {
      await this.prisma.userHeritage.update({
        where: { id: heritageId },
        data: { garaStatus: newStatus },
      });
    }

    this.eventEmitter.emit(NOTIFICATION_EVENTS.CREATE, {
      userId: heritage.userId,
      type: NotificationType.HERITAGE_MODERATION,
      entityId: heritageId,
    });

    return { success: true, status: newStatus };
  }

  private async verifyAndAddGaraToDirectory(
    heritageId: string,
    heritage: {
      userId: string;
      garaCustom: string | null;
      taipId: string | null;
    },
    dto: ReviewHeritageGaraDto,
  ) {
    const resolvedTaipId = dto.taipId ?? heritage.taipId;

    if (!resolvedTaipId) {
      throw new BadRequestException({
        code: ErrorCode.HERITAGE_TAIP_NOT_FOUND,
        message: "taipId is required to add gara to directory",
      });
    }

    const customName = heritage.garaCustom!.trim();
    const slug = this.toSlug(customName);

    const existingGara = await this.prisma.gara.findUnique({ where: { slug } });
    if (existingGara) {
      throw new ConflictException({
        code: ErrorCode.HERITAGE_GARA_SLUG_TAKEN,
        message: `Gara with slug "${slug}" already exists`,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const newGara = await tx.gara.create({
        data: {
          slug,
          name: { che: customName, ru: customName, en: customName } as unknown as Prisma.InputJsonValue,
          nekyi: [],
          taipId: resolvedTaipId,
          status: VerificationStatus.APPROVED,
          submittedById: heritage.userId,
        },
      });

      await tx.userHeritage.update({
        where: { id: heritageId },
        data: {
          garaStatus: VerificationStatus.APPROVED,
          garaId: newGara.id,
          garaCustom: null,
        },
      });
    });
  }

  // ─── Nations CRUD ─────────────────────────────────────────────────────────────

  async createNation(dto: CreateNationDto) {
    const existing = await this.prisma.nation.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.HERITAGE_NATION_SLUG_TAKEN,
        message: `Nation with slug "${dto.slug}" already exists`,
      });
    }
    return this.prisma.nation.create({
      data: { slug: dto.slug, name: dto.name as unknown as Prisma.InputJsonValue },
    });
  }

  async updateNation(id: string, dto: UpdateNationDto) {
    await this.assertNationExists(id);
    if (dto.slug) {
      const conflict = await this.prisma.nation.findFirst({
        where: { slug: dto.slug, NOT: { id } },
      });
      if (conflict) {
        throw new ConflictException({
          code: ErrorCode.HERITAGE_NATION_SLUG_TAKEN,
          message: `Nation with slug "${dto.slug}" already exists`,
        });
      }
    }
    return this.prisma.nation.update({
      where: { id },
      data: {
        ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
        ...(dto.name !== undefined ? { name: dto.name as unknown as Prisma.InputJsonValue } : {}),
      },
    });
  }

  async deleteNation(id: string) {
    await this.assertNationExists(id);
    await this.prisma.nation.delete({ where: { id } });
    return { success: true };
  }

  async getNations() {
    return this.prisma.nation.findMany({
      orderBy: { slug: "asc" },
      include: { _count: { select: { tukhumy: true, taips: true } } },
    });
  }

  // ─── Tukhumy CRUD ─────────────────────────────────────────────────────────────

  async createTukhum(dto: CreateTukhumDto) {
    await this.assertNationExists(dto.nationId);
    const existing = await this.prisma.tukhum.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.HERITAGE_TUKHUM_SLUG_TAKEN,
        message: `Tukhum with slug "${dto.slug}" already exists`,
      });
    }
    return this.prisma.tukhum.create({
      data: { slug: dto.slug, name: dto.name as unknown as Prisma.InputJsonValue, nationId: dto.nationId },
    });
  }

  async updateTukhum(id: string, dto: UpdateTukhumDto) {
    await this.assertTukhumExists(id);
    if (dto.nationId) await this.assertNationExists(dto.nationId);
    if (dto.slug) {
      const conflict = await this.prisma.tukhum.findFirst({
        where: { slug: dto.slug, NOT: { id } },
      });
      if (conflict) {
        throw new ConflictException({
          code: ErrorCode.HERITAGE_TUKHUM_SLUG_TAKEN,
          message: `Tukhum with slug "${dto.slug}" already exists`,
        });
      }
    }
    return this.prisma.tukhum.update({
      where: { id },
      data: {
        ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
        ...(dto.name !== undefined ? { name: dto.name as unknown as Prisma.InputJsonValue } : {}),
        ...(dto.nationId !== undefined ? { nationId: dto.nationId } : {}),
      },
    });
  }

  async deleteTukhum(id: string) {
    await this.assertTukhumExists(id);
    await this.prisma.tukhum.delete({ where: { id } });
    return { success: true };
  }

  async getTukhumy(nationId?: string) {
    return this.prisma.tukhum.findMany({
      where: nationId ? { nationId } : undefined,
      orderBy: { slug: "asc" },
      include: {
        nation: { select: { id: true, slug: true, name: true } },
        _count: { select: { taips: true } },
      },
    });
  }

  // ─── Taips CRUD ───────────────────────────────────────────────────────────────

  async createTaip(dto: CreateTaipDto) {
    await this.assertNationExists(dto.nationId);
    if (dto.tukhumId) await this.assertTukhumExists(dto.tukhumId);
    const existing = await this.prisma.taip.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.HERITAGE_TAIP_SLUG_TAKEN,
        message: `Taip with slug "${dto.slug}" already exists`,
      });
    }
    return this.prisma.taip.create({
      data: {
        slug: dto.slug,
        name: dto.name as unknown as Prisma.InputJsonValue,
        nekyi: [],
        nationId: dto.nationId,
        tukhumId: dto.tukhumId ?? null,
        status: VerificationStatus.APPROVED,
      },
    });
  }

  async updateTaip(id: string, dto: UpdateTaipDto) {
    await this.assertTaipExists(id);
    if (dto.nationId) await this.assertNationExists(dto.nationId);
    if (dto.tukhumId) await this.assertTukhumExists(dto.tukhumId);
    if (dto.slug) {
      const conflict = await this.prisma.taip.findFirst({
        where: { slug: dto.slug, NOT: { id } },
      });
      if (conflict) {
        throw new ConflictException({
          code: ErrorCode.HERITAGE_TAIP_SLUG_TAKEN,
          message: `Taip with slug "${dto.slug}" already exists`,
        });
      }
    }
    return this.prisma.taip.update({
      where: { id },
      data: {
        ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
        ...(dto.name !== undefined ? { name: dto.name as unknown as Prisma.InputJsonValue } : {}),
        ...(dto.nationId !== undefined ? { nationId: dto.nationId } : {}),
        ...(dto.tukhumId !== undefined ? { tukhumId: dto.tukhumId } : {}),
      },
    });
  }

  async deleteTaip(id: string) {
    await this.assertTaipExists(id);
    await this.prisma.taip.delete({ where: { id } });
    return { success: true };
  }

  async getTaips(nationId?: string, tukhumId?: string) {
    return this.prisma.taip.findMany({
      where: {
        ...(nationId ? { nationId } : {}),
        ...(tukhumId ? { tukhumId } : {}),
      },
      orderBy: { slug: "asc" },
      include: {
        nation: { select: { id: true, slug: true, name: true } },
        tukhum: { select: { id: true, slug: true, name: true } },
        _count: { select: { garas: true } },
      },
    });
  }

  // ─── Garas CRUD ───────────────────────────────────────────────────────────────

  async createGara(dto: CreateGaraDto) {
    await this.assertTaipExists(dto.taipId);
    const existing = await this.prisma.gara.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.HERITAGE_GARA_SLUG_TAKEN,
        message: `Gara with slug "${dto.slug}" already exists`,
      });
    }
    return this.prisma.gara.create({
      data: {
        slug: dto.slug,
        name: dto.name as unknown as Prisma.InputJsonValue,
        nekyi: [],
        taipId: dto.taipId,
        status: VerificationStatus.APPROVED,
      },
    });
  }

  async updateGara(id: string, dto: UpdateGaraDto) {
    await this.assertGaraExists(id);
    if (dto.taipId) await this.assertTaipExists(dto.taipId);
    if (dto.slug) {
      const conflict = await this.prisma.gara.findFirst({
        where: { slug: dto.slug, NOT: { id } },
      });
      if (conflict) {
        throw new ConflictException({
          code: ErrorCode.HERITAGE_GARA_SLUG_TAKEN,
          message: `Gara with slug "${dto.slug}" already exists`,
        });
      }
    }
    return this.prisma.gara.update({
      where: { id },
      data: {
        ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
        ...(dto.name !== undefined ? { name: dto.name as unknown as Prisma.InputJsonValue } : {}),
        ...(dto.taipId !== undefined ? { taipId: dto.taipId } : {}),
      },
    });
  }

  async deleteGara(id: string) {
    await this.assertGaraExists(id);
    await this.prisma.gara.delete({ where: { id } });
    return { success: true };
  }

  async getGaras(taipId?: string) {
    return this.prisma.gara.findMany({
      where: taipId ? { taipId } : undefined,
      orderBy: { slug: "asc" },
      include: {
        taip: { select: { id: true, slug: true, name: true } },
      },
    });
  }

  // ─── Assertion helpers ────────────────────────────────────────────────────────

  private async assertNationExists(id: string) {
    const record = await this.prisma.nation.findUnique({ where: { id }, select: { id: true } });
    if (!record) {
      throw new NotFoundException({
        code: ErrorCode.HERITAGE_NATION_NOT_FOUND,
        message: `Nation #${id} not found`,
      });
    }
  }

  private async assertTukhumExists(id: string) {
    const record = await this.prisma.tukhum.findUnique({ where: { id }, select: { id: true } });
    if (!record) {
      throw new NotFoundException({
        code: ErrorCode.HERITAGE_TUKHUM_NOT_FOUND,
        message: `Tukhum #${id} not found`,
      });
    }
  }

  private async assertTaipExists(id: string) {
    const record = await this.prisma.taip.findUnique({ where: { id }, select: { id: true } });
    if (!record) {
      throw new NotFoundException({
        code: ErrorCode.HERITAGE_TAIP_NOT_FOUND,
        message: `Taip #${id} not found`,
      });
    }
  }

  private async assertGaraExists(id: string) {
    const record = await this.prisma.gara.findUnique({ where: { id }, select: { id: true } });
    if (!record) {
      throw new NotFoundException({
        code: ErrorCode.HERITAGE_GARA_NOT_FOUND,
        message: `Gara #${id} not found`,
      });
    }
  }

  // ─── Utils ────────────────────────────────────────────────────────────────────

  private toSlug(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w\-Ѐ-ӿЀ-ӿ]/g, "")
      .replace(/--+/g, "-");
  }
}
