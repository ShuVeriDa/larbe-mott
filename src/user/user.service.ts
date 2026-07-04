import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, UserStatus } from "@prisma/client";
import { hash, argon2id } from "argon2";
import * as fs from "fs";
import { join } from "path";

const ARGON2_OPTIONS = {
  type: argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

import { PermissionsService } from "src/auth/permissions/permissions.service";
import { RefreshTokenLockService } from "src/auth/refresh-token-lock.service";
import { PrismaService } from "../prisma.service";
import { RedisService } from "src/redis/redis.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { DeleteAccountDto } from "./dto/delete-account.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { ErrorCode } from "src/common/errors/error-codes";
import { ImageProcessingService } from "src/common/image-processing/image-processing.service";

const USER_CACHE_TTL = 60;

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
    private readonly redis: RedisService,
    private readonly imageProcessing: ImageProcessingService,
    private readonly refreshLock: RefreshTokenLockService,
  ) {}

  private userCacheKey = (id: string) => `user:profile:${id}`;

  private async invalidateUserCache(id: string) {
    await this.redis.del(this.userCacheKey(id));
  }

  async getUserById(id: string) {
    const cacheKey = this.userCacheKey(id);
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as ReturnType<typeof this.getUserById> extends Promise<infer T> ? T : never;
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) throw new NotFoundException({ code: ErrorCode.USER_NOT_FOUND, message: "The user not found" });

    const {
      password,
      hashedRefreshToken: __,
      ...safeUser
    } = user as typeof user & {
      hashedRefreshToken?: string | null;
    };

    const permissionsSet = await this.permissionsService.getUserPermissions(id);

    const result = {
      ...safeUser,
      permissions: [...permissionsSet],
    };

    await this.redis.setex(cacheKey, USER_CACHE_TTL, JSON.stringify(result));

    return result;
  }

  async getByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email: email },
    });
  }

  async getByUserName(username: string) {
    return this.prisma.user.findFirst({
      where: { username: username },
    });
  }

  async create(dto: CreateUserDto) {
    const user = await this.userObj(dto);

    try {
      return await this.prisma.user.create({ data: user });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException({ code: ErrorCode.USER_ALREADY_EXISTS, message: "User with this email or username already exists" });
      }
      throw e;
    }
  }

  async deleteUser(userId: string, dto: DeleteAccountDto) {
    const user = await this.validateUser(userId);

    if (
      dto.confirmEmail.trim().toLowerCase() !== user.email.trim().toLowerCase()
    ) {
      throw new BadRequestException({ code: ErrorCode.EMAIL_MISMATCH, message: "Confirmation email does not match the account email" });
    }

    if (user.status === UserStatus.DELETED) {
      throw new BadRequestException({ code: ErrorCode.ALREADY_SCHEDULED_FOR_DELETION, message: "Account is already scheduled for deletion" });
    }

    // Soft-delete: ставим статус DELETED + deletedAt. Hard-delete выполняется фоновым cron-job
    // через 30 дней (см. settings-spec.md / TODO в auth.service). Также сбрасываем refresh-token,
    // чтобы текущая сессия не могла продолжить работу.
    // Guarded by refreshLock: without it, an in-flight token rotation could
    // finish right after this update and re-set a valid hash, un-revoking access.
    await this.refreshLock.withLock(user.id, () =>
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          status: UserStatus.DELETED,
          deletedAt: new Date(),
          hashedRefreshToken: null,
        },
      }),
    );

    await this.prisma.userSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.invalidateUserCache(userId);

    return {
      success: true,
      message:
        "Account scheduled for deletion. Data will be retained for 30 days, then permanently removed.",
    };
  }

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new NotFoundException({ code: ErrorCode.USER_NOT_FOUND, message: "The user not found" });

    return user;
  }

  async updateUser(dto: UpdateUserDto, userId: string) {
    const user = await this.getUserById(userId);

    try {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          name: dto.name,
          surname: dto.surname,
          username: dto.username,
          phone: dto.phone,
          language: dto.language,
          level: dto.level,
          // Пустая строка == сброс аватара. undefined — поле не передано, не трогаем.
          avatar: dto.avatar === "" ? null : dto.avatar,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException({ code: ErrorCode.USERNAME_TAKEN, message: "Username is already taken" });
      }
      throw e;
    }

    await this.invalidateUserCache(userId);
    return this.getUserById(userId);
  }

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException({ code: ErrorCode.USER_NOT_FOUND, message: "The user not found" });

    for (const field of [user.avatar, user.avatarThumb, user.avatarMedium]) {
      if (field?.startsWith("/uploads/avatars/")) {
        fs.unlink(join(process.cwd(), field), () => {});
      }
    }

    const outputDir = join(process.cwd(), "uploads", "avatars");
    const baseName = `avatar-${userId}-${file.filename.split(".")[0].split("-").pop()}`;
    const variants = await this.imageProcessing.processAvatar(file.path, baseName, outputDir);

    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          avatar: variants.original,
          avatarThumb: variants.thumb,
          avatarMedium: variants.medium,
        },
      });
    } catch (e) {
      throw e;
    }

    await this.invalidateUserCache(userId);
    return this.getUserById(userId);
  }

  private userObj = async (dto: CreateUserDto) => {
    const user = {
      email: dto.email,
      password: await hash(dto.password, ARGON2_OPTIONS),
      name: dto.name,
      surname: dto.surname,
      username: dto.username,
      phone: dto.phone,
    } as Prisma.UserCreateInput;

    return user;
  };
}
