import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { RedisModule } from "src/redis/redis.module";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

@Module({
  imports: [RedisModule],
  controllers: [HealthController],
  providers: [HealthService, PrismaService],
})
export class HealthModule {}
