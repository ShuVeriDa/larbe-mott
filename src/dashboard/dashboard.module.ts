import { Module } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AnalyticsModule } from "src/analytics/analytics.module";
import { AuthModule } from "src/auth/auth.module";
import { PermissionsService } from "src/auth/permissions/permissions.service";
import { PrismaService } from "src/prisma.service";
import { TextModule } from "src/text/text.module";
import { ImageProcessingModule } from "src/common/image-processing/image-processing.module";
import { UserService } from "src/user/user.service";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [AuthModule, AnalyticsModule, TextModule, ImageProcessingModule],
  controllers: [DashboardController],
  providers: [DashboardService, PrismaService, UserService, PermissionsService, JwtService],
})
export class DashboardModule {}
