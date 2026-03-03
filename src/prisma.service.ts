import {
  type OnModuleDestroy,
  type OnModuleInit,
  Injectable,
} from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    // ESLint cannot resolve @prisma/adapter-pg types in this project
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- PrismaPg is typed in the package
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
    });
    super({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- adapter from @prisma/adapter-pg
      adapter,
      log:
        process.env.NODE_ENV === "development"
          ? ["query", "error", "warn"]
          : ["error"],
    });
  }
  async onModuleInit() {
    // Подключаемся к БД только если еще не подключены
    await this.$connect();
  }

  async onModuleDestroy() {
    // Закрываем соединение при завершении
    await this.$disconnect();
  }
}
