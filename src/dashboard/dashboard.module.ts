import { Module } from "@nestjs/common";
import { AnalyticsModule } from "src/analytics/analytics.module";
import { AuthModule } from "src/auth/auth.module";
import { PrismaService } from "src/prisma.service";
import { TextModule } from "src/text/text.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [AuthModule, AnalyticsModule, TextModule],
  controllers: [DashboardController],
  providers: [DashboardService, PrismaService],
})
export class DashboardModule {}
