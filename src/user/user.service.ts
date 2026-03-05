import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { hash } from "argon2";
import { PrismaService } from "../prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

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

    return this.prisma.user.create({
      data: user,
    });
  }

  async deleteUser(userId: string) {
    const user = await this.validateUser(userId);

    await this.prisma.user.delete({
      where: { id: user.id },
    });

    return "The user has been deleted successfully";
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

    const password = dto.password ? await hash(dto.password) : undefined;

    const createdUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        email: dto.email,
        password: password,
        name: dto.name,
        surname: dto.surname,
        username: dto.username,
        phone: dto.phone,
      },
    });

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
      role: UserRole.USER,
    } as Prisma.UserCreateInput;

    return user;
  };
}
