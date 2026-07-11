import { Module } from "@nestjs/common";
import { AnalyticsModule } from "src/analytics/analytics.module";
import { TextProgressModule } from "src/progress/text-progress/text-progress.module";
import { PrismaService } from "src/prisma.service";
import { StatisticsController } from "./statistics.controller";
import { StatisticsService } from "./statistics.service";

@Module({
  imports: [AnalyticsModule, TextProgressModule],
  controllers: [StatisticsController],
  providers: [StatisticsService, PrismaService],
})
export class StatisticsModule {}
