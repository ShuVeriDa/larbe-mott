import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { AuthModule } from "src/auth/auth.module";
import { PrismaService } from "src/prisma.service";
import { RedisModule } from "src/redis/redis.module";
import { GeoIpService } from "./geoip.service";
import { TrackingService } from "./tracking.service";
import { TrackingQueueWorker } from "./tracking-queue.worker";
import { TrackingAggregatorService } from "./tracking-aggregator.service";
import { TrackingAdminService } from "./tracking-admin.service";
import { TrackingController } from "./tracking.controller";
import { TrackingAdminController } from "./tracking-admin.controller";

@Module({
  imports: [ConfigModule, ScheduleModule, RedisModule, AuthModule],
  providers: [
    PrismaService,
    GeoIpService,
    TrackingService,
    TrackingQueueWorker,
    TrackingAggregatorService,
    TrackingAdminService,
  ],
  controllers: [TrackingController, TrackingAdminController],
  exports: [TrackingService],
})
export class TrackingModule {}
