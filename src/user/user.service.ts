import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, UserStatus } from "@prisma/client";
import { hash } from "argon2";
import { PrismaService } from "../prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { DeleteAccountDto } from "./dto/delete-account.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

// Конфликт с username — единственно возможный для PATCH /users теперь, когда
// email/password убраны в auth-flow.

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) throw new NotFoundException("The user not found");

    const {
      password,
      hashedRefreshToken: __,
      ...safeUser
    } = user as typeof user & {
      hashedRefreshToken?: string | null;
    };

    return safeUser;
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
        throw new ConflictException("User with this email or username already exists");
      }
      throw e;
    }
  }

  async deleteUser(userId: string, dto: DeleteAccountDto) {
    const user = await this.validateUser(userId);

    if (
      dto.confirmEmail.trim().toLowerCase() !== user.email.trim().toLowerCase()
    ) {
      throw new BadRequestException(
        "Confirmation email does not match the account email",
      );
    }

    if (user.status === UserStatus.DELETED) {
      throw new BadRequestException("Account is already scheduled for deletion");
    }

    // Soft-delete: ставим статус DELETED + deletedAt. Hard-delete выполняется фоновым cron-job
    // через 30 дней (см. settings-spec.md / TODO в auth.service). Также сбрасываем refresh-token,
    // чтобы текущая сессия не могла продолжить работу.
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        status: UserStatus.DELETED,
        deletedAt: new Date(),
        hashedRefreshToken: null,
      },
    });

    await this.prisma.userSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

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

    if (!user) throw new NotFoundException("The user not found");

    return user;
  }

  async updateUser(dto: UpdateUserDto, userId: string) {
    const user = await this.getUserById(userId);

    let createdUser: Awaited<ReturnType<typeof this.prisma.user.update>>;
    try {
      createdUser = await this.prisma.user.update({
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
        throw new ConflictException("Username is already taken");
      }
      throw e;
    }

    const {
      password: _,
      hashedRefreshToken: __,
      ...safeUser
    } = createdUser as typeof createdUser & {
      hashedRefreshToken?: string | null;
    };

    return safeUser;
  }

  private userObj = async (dto: CreateUserDto) => {
    const user = {
      email: dto.email,
      password: await hash(dto.password),
      name: dto.name,
      surname: dto.surname,
      username: dto.username,
      phone: dto.phone,
    } as Prisma.UserCreateInput;

    return user;
  };
}
